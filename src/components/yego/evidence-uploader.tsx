import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Camera, FileText, Loader2, RotateCcw, Video, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  createEvidenceUpload,
  discardEvidenceUpload,
  uploadEvidenceChunk,
  type IncidentEvidenceUpload,
} from '@/lib/demo-store'
import { cn } from '@/lib/utils'

const EVIDENCE_MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
}

const SIZE_CAPS_MB: Record<string, number> = {
  photo: 10,
  video: 100,
  document: 20,
}

export const EVIDENCE_MAX_FILES = 6

export type EvidenceKind = 'photo' | 'video' | 'document'

function kindOf(mimeType: string): EvidenceKind | null {
  if (mimeType.startsWith('image/')) return 'photo'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf') return 'document'
  return null
}

/** Resolve the effective MIME type; many phone browsers report an empty file.type. */
function resolveMimeType(file: File): string | null {
  const byType = file.type.trim().toLowerCase()
  if (byType && EVIDENCE_MIME_BY_EXTENSION[byType]) return byType
  if (byType && Object.values(EVIDENCE_MIME_BY_EXTENSION).includes(byType)) return byType
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  return EVIDENCE_MIME_BY_EXTENSION[ext] ?? null
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`
  return `${bytes} B`
}

interface UploaderItem {
  uploadId: string
  file: File
  kind: EvidenceKind
  status: 'pending' | 'uploading' | 'ready' | 'error'
  progress: number
  error?: string
  upload?: IncidentEvidenceUpload
}

async function fileToBase64(slice: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(slice)
  })
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

/**
 * Shared evidence picker for the guard quick-report wizard and the command
 * incident dialog. Files are validated in the browser AND on the server, then
 * uploaded in <= 3 MiB chunks straight to private evidence storage — the bytes
 * never touch the database and never ride in one oversized request.
 */
export function EvidenceUploader({
  value,
  onChange,
  disabled,
  onPendingChange,
}: {
  value: IncidentEvidenceUpload[]
  onChange: (items: IncidentEvidenceUpload[]) => void
  disabled?: boolean
  /** Reports how many files are queued/uploading so parents can disable submission. */
  onPendingChange?: (pendingCount: number) => void
}) {
  const [items, setItems] = useState<UploaderItem[]>([])
  const itemsRef = useRef<UploaderItem[]>([])
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  function patchItem(uploadId: string, patch: Partial<UploaderItem>) {
    setItems((prev) => prev.map((item) => (item.uploadId === uploadId ? { ...item, ...patch } : item)))
  }

  async function uploadOne(file: File, kind: EvidenceKind, mimeType: string, uploadId: string) {
    try {
      patchItem(uploadId, { status: 'uploading', progress: 0, error: undefined })
      const slot = await createEvidenceUpload({ fileName: file.name, mimeType, byteSize: file.size })
      for (let partIndex = 0; partIndex < slot.parts; partIndex += 1) {
        const start = partIndex * slot.chunkSize
        const slice = file.slice(start, Math.min(start + slot.chunkSize, file.size))
        const data = await fileToBase64(slice)
        await uploadEvidenceChunk({
          storageKey: slot.storageKey,
          ticket: slot.ticket,
          mimeType,
          byteSize: file.size,
          exp: slot.expiresAt,
          partIndex,
          data,
        })
        patchItem(uploadId, { progress: Math.round(((partIndex + 1) / slot.parts) * 100) })
      }
      const upload: IncidentEvidenceUpload = {
        kind,
        name: file.name,
        mimeType,
        byteSize: file.size,
        storageKey: slot.storageKey,
        ticket: slot.ticket,
        exp: slot.expiresAt,
        parts: slot.parts,
      }
      patchItem(uploadId, { status: 'ready', progress: 100, upload })
      onChange([...value, upload])
    } catch (error) {
      patchItem(uploadId, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Upload failed.',
      })
    }
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList || disabled) return
    const incoming = Array.from(fileList)
    for (const file of incoming) {
      if (itemsRef.current.length >= EVIDENCE_MAX_FILES) {
        toast.error(`A report can carry at most ${EVIDENCE_MAX_FILES} attachments.`)
        break
      }
      const mimeType = resolveMimeType(file)
      const kind = mimeType ? kindOf(mimeType) : null
      if (!mimeType || !kind) {
        toast.error(`${file.name}: unsupported file type. Use JPG, PNG, WebP, MP4/WebM video or PDF.`)
        continue
      }
      if (file.size > SIZE_CAPS_MB[kind] * 1024 * 1024) {
        toast.error(`${file.name}: too large. The ${kind} limit is ${SIZE_CAPS_MB[kind]} MB.`)
        continue
      }
      const uploadId = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const item: UploaderItem = { uploadId, file, kind, status: 'pending', progress: 0 }
      setItems((prev) => [...prev, item])
      void uploadOne(file, kind, mimeType, uploadId)
    }
  }

  async function removeItem(item: UploaderItem) {
    setItems((prev) => prev.filter((entry) => entry.uploadId !== item.uploadId))
    if (item.upload) {
      // Best-effort cleanup of the stored object; the ticket expires on its own.
      void discardEvidenceUpload({
        storageKey: item.upload.storageKey,
        ticket: item.upload.ticket,
        mimeType: item.upload.mimeType,
        byteSize: item.upload.byteSize,
        exp: item.upload.exp,
      }).catch(() => {})
      onChange(value.filter((entry) => entry.storageKey !== item.upload?.storageKey))
    }
  }

  const visible = [...items]
  const readyCount = value.length

  useEffect(() => {
    const pending = items.filter((item) => item.status === 'pending' || item.status === 'uploading').length
    onPendingChange?.(pending)
  }, [items, onPendingChange])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Camera, label: 'Photo', accept: 'image/jpeg,image/png,image/webp,image/*' },
          { icon: Video, label: 'Video', accept: 'video/mp4,video/webm,video/quicktime,video/*' },
          { icon: FileText, label: 'Document', accept: 'application/pdf,.pdf' },
        ].map((b) => (
          <label
            key={b.label}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed p-4 text-sm font-semibold hover:bg-muted',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            <b.icon className="size-6 text-primary" />
            {b.label}
            <input
              type="file"
              accept={b.accept}
              capture={b.label === 'Document' ? undefined : 'environment'}
              multiple={b.label !== 'Document'}
              className="sr-only"
              disabled={disabled}
              onChange={(e) => {
                void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        ))}
      </div>

      {(visible.length > 0 || readyCount > 0) && (
        <ul className="space-y-1.5 text-sm">
          {visible.map((item) => (
            <li key={item.uploadId} className="rounded-md border bg-muted/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate" title={item.file.name}>
                  {item.kind === 'photo' ? (
                    <Camera className="mr-1.5 inline size-4 text-primary" />
                  ) : item.kind === 'video' ? (
                    <Video className="mr-1.5 inline size-4 text-primary" />
                  ) : (
                    <FileText className="mr-1.5 inline size-4 text-primary" />
                  )}
                  {item.file.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {formatBytes(item.file.size)} · {item.kind}
                  </span>
                </span>
                <button type="button" aria-label={`Remove ${item.file.name}`} disabled={disabled} onClick={() => void removeItem(item)}>
                  <X className="size-4" />
                </button>
              </div>
              {item.status === 'uploading' && (
                <div className="mt-1.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Uploading… {item.progress}%</p>
                </div>
              )}
              {item.status === 'pending' && <p className="mt-1 text-xs text-muted-foreground">Preparing…</p>}
              {item.status === 'ready' && (
                <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                  <Loader2 className="size-3" aria-hidden /> Attached — it will be sent with the report.
                </p>
              )}
              {item.status === 'error' && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="size-3.5" /> {item.error}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void uploadOne(item.file, item.kind, resolveMimeType(item.file) ?? '', item.uploadId)}
                  >
                    <RotateCcw /> Retry
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        JPG, PNG or WebP photos up to {SIZE_CAPS_MB.photo} MB · MP4/WebM videos up to {SIZE_CAPS_MB.video} MB · PDF
        documents up to {SIZE_CAPS_MB.document} MB · at most {EVIDENCE_MAX_FILES} attachments. Evidence is private:
        only authorized YEGO officers can open it.
      </p>
    </div>
  )
}
