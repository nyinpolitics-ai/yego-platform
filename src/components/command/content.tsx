// Content Management System workspace for the Command Centre.
//
// The same module serves Content Administrators and Super Administrators —
// what differs is the capability set, which the server enforces on every call
// (the UI merely hides buttons the server would reject anyway).
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Archive,
  CloudUpload,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ContentArticle } from '@/components/yego/article'
import { Field, NativeSelect } from '@/components/yego/fields'
import {
  AUDIENCE_LABELS,
  CONTENT_AUDIENCES,
  CONTENT_CATEGORIES,
  slugify,
  type ContentAudience,
  type ContentItem,
} from '@/lib/content'
import {
  archiveContent,
  createContent,
  deleteContent,
  listContent,
  publishContent,
  restoreContent,
  retryContentEmails,
  unpublishContent,
  updateContent,
  useDB,
} from '@/lib/demo-store'
import { fmtDateTime, timeAgo } from '@/lib/format'
import { can, type Capability } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { StatCard } from './shared'

type StatusFilter = 'all' | 'draft' | 'published' | 'archived' | 'deleted'

interface EditorState {
  id?: string
  title: string
  slug: string
  slugTouched: boolean
  summary: string
  body: string
  category: string
  audience: ContentAudience
  featuredImage?: string
  gallery: { name: string; data: string }[]
  attachments: { name: string; data: string }[]
  videoUrl: string
  resourceUrl: string
  eventStartAt: string
  eventLocation: string
  publish: boolean
  notifyInApp: boolean
  notifyEmail: boolean
}

const EMPTY_EDITOR: EditorState = {
  title: '',
  slug: '',
  slugTouched: false,
  summary: '',
  body: '',
  category: 'News',
  audience: 'public',
  gallery: [],
  attachments: [],
  videoUrl: '',
  resourceUrl: '',
  eventStartAt: '',
  eventLocation: '',
  publish: false,
  notifyInApp: false,
  notifyEmail: false,
}

function editorFromItem(item: ContentItem): EditorState {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    slugTouched: true,
    summary: item.summary,
    body: item.body,
    category: item.category,
    audience: item.audience,
    featuredImage: item.featuredImage,
    gallery: item.gallery,
    attachments: item.attachments,
    videoUrl: item.videoUrl ?? '',
    resourceUrl: item.resourceUrl ?? '',
    eventStartAt: item.eventStartAt ? item.eventStartAt.slice(0, 16) : '',
    eventLocation: item.eventLocation ?? '',
    publish: item.status === 'published',
    notifyInApp: item.notifyInApp,
    notifyEmail: item.notifyEmail,
  }
}

/** Downscale any image to a light JPEG data URL (same approach as profile photos). */
function readImage(file: File, maxSize = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file.'))
    if (file.size > 12 * 1024 * 1024) return reject(new Error('Image must be under 12 MB.'))
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        const data = canvas.toDataURL('image/jpeg', quality)
        URL.revokeObjectURL(img.src)
        if (data.length > 600_000) reject(new Error('That image is still too large — try a smaller or simpler picture.'))
        else resolve(data)
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Could not process the image.'))
      }
    }
    img.onerror = () => reject(new Error('Could not read that image.'))
    img.src = URL.createObjectURL(file)
  })
}

function readPdf(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type !== 'application/pdf') return reject(new Error('Only PDF documents can be attached.'))
    if (file.size > 900_000) return reject(new Error('The PDF must be under 900 KB.'))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the document.'))
    reader.readAsDataURL(file)
  })
}

export function ContentView() {
  const { session } = useDB()
  const role = session?.role
  const [data, setData] = useState<Awaited<ReturnType<typeof listContent>> | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [preview, setPreview] = useState<ContentItem | null>(null)
  const [publishTarget, setPublishTarget] = useState<ContentItem | null>(null)
  const [confirm, setConfirm] = useState<{ action: 'unpublish' | 'archive' | 'delete' | 'restore'; item: ContentItem } | null>(null)
  const [retrying, setRetrying] = useState(false)

  const may = useCallback((cap: Capability) => can(role, cap), [role])

  const load = useCallback(async () => {
    try {
      setData(await listContent({ q: q.trim() || undefined, category: category || undefined, status, page }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load content.')
      setData(null)
    }
  }, [q, category, status, page])

  useEffect(() => {
    let cancelled = false
    listContent({ q: q.trim() || undefined, category: category || undefined, status, page })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Could not load content.')
          setData(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [q, category, status, page])

  const rows = data?.rows ?? []
  const stats = data?.stats
  const pageCount = data ? Math.max(1, Math.ceil(data.totalRows / data.pageSize)) : 1

  async function runAction(action: () => Promise<unknown>, message: string) {
    try {
      await action()
      toast.success(message)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The action failed.')
    }
  }

  async function retryEmails() {
    setRetrying(true)
    try {
      const result = await retryContentEmails()
      toast.success(`Email queue: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not process the email queue.')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="space-y-4">
      <section aria-label="Content summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total content" value={stats?.total ?? '…'} tone="primary" />
        <StatCard label="Published" value={stats?.published ?? '…'} />
        <StatCard label="Drafts" value={stats?.draft ?? '…'} />
        <StatCard label="Archived" value={stats?.archived ?? '…'} sub={stats?.deleted ? `${stats.deleted} in recycle bin` : undefined} />
      </section>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-56 text-xs font-semibold">
            Search
            <Input
              className="mt-1 h-9"
              placeholder="Title, summary or slug"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
            />
          </label>
          <label className="w-52 text-xs font-semibold">
            Category
            <NativeSelect
              className="mt-1 h-9"
              placeholder="All categories"
              options={[...CONTENT_CATEGORIES]}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                setPage(1)
              }}
            />
          </label>
          <label className="w-40 text-xs font-semibold">
            Status
            <NativeSelect
              className="mt-1 h-9"
              options={['all', 'draft', 'published', 'archived', 'deleted']}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter)
                setPage(1)
              }}
            />
          </label>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => void retryEmails()} disabled={retrying}>
            {retrying ? <Loader2 className="animate-spin" /> : <Send />} Retry pending emails
          </Button>
          {may('create:content') && (
            <Button size="sm" onClick={() => setEditor({ ...EMPTY_EDITOR })}>
              <Plus /> New content
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="p-3 font-semibold">Content</th>
              <th className="p-3 font-semibold">Category</th>
              <th className="p-3 font-semibold">Audience</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 font-semibold">Author</th>
              <th className="p-3 font-semibold">Published</th>
              <th className="p-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((item) => (
              <tr key={item.id} className={cn('align-top', item.status === 'archived' && 'opacity-70')}>
                <td className="p-3">
                  <p className="font-bold leading-snug">{item.title}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">/{item.slug}</p>
                </td>
                <td className="p-3 text-xs">{item.category}</td>
                <td className="p-3 text-xs">{item.audience}</td>
                <td className="p-3">
                  <StatusBadge item={item} />
                </td>
                <td className="p-3 text-xs">{item.createdByLabel}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {item.publishedAt ? fmtDateTime(item.publishedAt) : '—'}
                  {item.notificationSentAt && (
                    <p className="mt-1 text-[11px]">Notified {timeAgo(item.notificationSentAt)}</p>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setPreview(item)} title="Preview">
                      <Eye />
                    </Button>
                    {may('edit:content') && (
                      <Button size="sm" variant="outline" onClick={() => setEditor(editorFromItem(item))}>
                        <Pencil /> Edit
                      </Button>
                    )}
                    {may('publish:content') && item.status !== 'published' && (
                      <Button size="sm" onClick={() => setPublishTarget(item)}>
                        <Upload /> Publish
                      </Button>
                    )}
                    {may('unpublish:content') && (item.status === 'published' || item.status === 'archived') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirm({ action: 'unpublish', item })}
                      >
                        <Undo2 /> Unpublish
                      </Button>
                    )}
                    {may('archive:content') && item.status !== 'archived' && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirm({ action: 'archive', item })}>
                        <Archive /> Archive
                      </Button>
                    )}
                    {may('delete:content') && !item.deletedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-700 hover:bg-red-50 hover:text-red-800"
                        onClick={() => setConfirm({ action: 'delete', item })}
                      >
                        <Trash2 /> Delete
                      </Button>
                    )}
                    {may('delete:content') && !!item.deletedAt && (
                      <Button size="sm" variant="outline" onClick={() => setConfirm({ action: 'restore', item })}>
                        <RotateCcw /> Restore
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No content items{status !== 'all' ? ' in this view' : ''} yet.
                  {may('create:content') && ' Use “New content” to publish the first update.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {page} of {pageCount} · {data?.totalRows ?? 0} items
          </p>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {editor && (
        <ContentEditor
          state={editor}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null)
            await load()
          }}
        />
      )}

      {preview && <PreviewDialog item={preview} onClose={() => setPreview(null)} />}
      {publishTarget && (
        <PublishDialog
          item={publishTarget}
          onClose={() => setPublishTarget(null)}
          onPublished={async () => {
            setPublishTarget(null)
            await load()
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={CONFIRM_COPY[confirm.action].title(confirm.item)}
          description={CONFIRM_COPY[confirm.action].description}
          confirmLabel={CONFIRM_COPY[confirm.action].label}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const { action, item } = confirm
            setConfirm(null)
            if (action === 'unpublish') await runAction(() => unpublishContent(item.id), 'Content unpublished — it is no longer visible.')
            if (action === 'archive') await runAction(() => archiveContent(item.id), 'Content archived.')
            if (action === 'delete') await runAction(() => deleteContent(item.id), 'Content moved to the recycle bin. Restore any time.')
            if (action === 'restore') await runAction(() => restoreContent(item.id), 'Content restored.')
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ item }: { item: { status: string; deletedAt?: string } }) {
  if (item.deletedAt) {
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">
        Deleted
      </Badge>
    )
  }
  if (item.status === 'published') {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
        Published
      </Badge>
    )
  }
  if (item.status === 'archived') {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
        Archived
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Draft
    </Badge>
  )
}

const CONFIRM_COPY: Record<
  'unpublish' | 'archive' | 'delete' | 'restore',
  { title: (item: ContentItem) => string; description: string; label: string }
> = {
  unpublish: {
    title: (item) => `Unpublish “${item.title}”?`,
    description:
      'The item returns to a draft and immediately disappears from the News & Updates page and all dashboards.',
    label: 'Unpublish',
  },
  archive: {
    title: (item) => `Archive “${item.title}”?`,
    description:
      'Archived content is kept for the record but hidden from every public listing and dashboard until it is published again.',
    label: 'Archive',
  },
  delete: {
    title: (item) => `Delete “${item.title}”?`,
    description:
      'The item moves to the recycle bin and is hidden everywhere. A Super Administrator or you can restore it later — nothing is permanently erased.',
    label: 'Delete',
  },
  restore: {
    title: (item) => `Restore “${item.title}”?`,
    description: 'The item returns to its previous publication status.',
    label: 'Restore',
  },
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                setBusy(false)
              }
            }}
            disabled={busy}
          >
            {busy && <Loader2 className="animate-spin" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PublishDialog({
  item,
  onClose,
  onPublished,
}: {
  item: ContentItem
  onClose: () => void
  onPublished: () => Promise<void>
}) {
  const [notifyInApp, setNotifyInApp] = useState(item.audience !== 'public')
  const [notifyEmail, setNotifyEmail] = useState(false)
  const [busy, setBusy] = useState(false)
  const restricted = item.audience !== 'public'

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publish “{item.title}”?</DialogTitle>
          <DialogDescription>
            Direct publishing — no approval queue. The item goes live immediately for the {item.audience} audience.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {restricted ? (
            <>
              <label className="flex items-start gap-2">
                <Checkbox checked={notifyInApp} onCheckedChange={(value) => setNotifyInApp(value === true)} />
                <span>
                  Notify this audience inside the portal
                  <span className="block text-xs text-muted-foreground">
                    Adds an in-app notification for every eligible recipient. Sent once for this item.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <Checkbox checked={notifyEmail} onCheckedChange={(value) => setNotifyEmail(value === true)} />
                <span>
                  Also send an email via Resend
                  <span className="block text-xs text-muted-foreground">
                    Queued for verified recipients in the audience; delivery continues in the background.
                  </span>
                </span>
              </label>
            </>
          ) : (
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Public content appears on the News &amp; Updates page for everyone. Notifications apply to portal audiences,
              so they are not available for public-only items.
            </p>
          )}
          {item.notificationSentAt && (
            <p className="text-xs text-muted-foreground">
              Notifications for this item were already sent {timeAgo(item.notificationSentAt)} — publishing again will not
              resend them.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await publishContent(item.id, notifyInApp && restricted, notifyEmail && restricted)
                toast.success('Published. The item is live now.')
                await onPublished()
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not publish.')
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} <Upload /> Publish now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewDialog({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye className="size-4 text-primary" /> Preview
            <Badge variant="outline" className="ml-2 normal-case">
              {item.status} · {item.audience}
            </Badge>
          </DialogTitle>
          <DialogDescription>Exactly how the article renders on the site (draft state preview).</DialogDescription>
        </DialogHeader>
        <ContentArticle item={item} />
      </DialogContent>
    </Dialog>
  )
}

function ContentEditor({
  state,
  onClose,
  onSaved,
}: {
  state: EditorState
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState<EditorState>(state)
  const [busy, setBusy] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const featuredInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const attachmentInput = useRef<HTMLInputElement>(null)
  const editing = !!form.id
  const lockedPublished = editing && state.publish
  const restricted = form.audience !== 'public'

  function set<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const slugValue = form.slugTouched && form.slug ? form.slug : slugify(form.title || '')

  async function save(publish: boolean) {
    setBusy(true)
    try {
      const payload = {
        title: form.title.trim(),
        slug: slugValue,
        summary: form.summary.trim(),
        body: form.body,
        category: form.category,
        audience: form.audience,
        featuredImage: form.featuredImage,
        gallery: form.gallery,
        attachments: form.attachments,
        videoUrl: form.videoUrl.trim() || undefined,
        resourceUrl: form.resourceUrl.trim() || undefined,
        eventStartAt: form.eventStartAt || undefined,
        eventLocation: form.eventLocation.trim() || undefined,
        publish,
        notifyInApp: form.notifyInApp && restricted,
        notifyEmail: form.notifyEmail && restricted,
      }
      if (editing && form.id) {
        await updateContent(form.id, payload)
      } else {
        await createContent(payload)
      }
      toast.success(
        publish
          ? 'Published. The item is live for its audience.'
          : 'Draft saved. Publish it when it is ready.',
      )
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the content.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit content' : 'New content'}</DialogTitle>
            <DialogDescription>
              You can save a draft at any time. Publishing is direct — no approval queue.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Field label="Title" htmlFor="c-title">
              <Input
                id="c-title"
                value={form.title}
                maxLength={160}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. YEGO opens training centres in six states"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="URL slug" htmlFor="c-slug" hint="Leave as generated from the title.">
                <Input
                  id="c-slug"
                  value={slugValue}
                  maxLength={160}
                  onChange={(e) => setForm((current) => ({ ...current, slug: e.target.value, slugTouched: true }))}
                />
              </Field>
              <Field label="Category" htmlFor="c-category">
                <NativeSelect
                  id="c-category"
                  options={[...CONTENT_CATEGORIES]}
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                />
              </Field>
            </div>
            <Field label="Audience" htmlFor="c-audience" hint="Who is allowed to see this content.">
              <select
                id="c-audience"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={form.audience}
                onChange={(e) => set('audience', e.target.value as ContentAudience)}
              >
                {CONTENT_AUDIENCES.map((value) => (
                  <option key={value} value={value}>
                    {AUDIENCE_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Short summary" htmlFor="c-summary" hint="Shown on cards and in notifications (max 500 characters).">
              <Textarea
                id="c-summary"
                rows={2}
                maxLength={500}
                value={form.summary}
                onChange={(e) => set('summary', e.target.value)}
              />
            </Field>
            <Field
              label="Main content"
              htmlFor="c-body"
              hint="Plain text. Inline formatting: **bold**, *italic* and [link text](https://…). Blank lines start a new paragraph."
            >
              <Textarea id="c-body" rows={12} maxLength={20000} value={form.body} onChange={(e) => set('body', e.target.value)} />
            </Field>

            {form.category === 'Upcoming Events' && (
              <div className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-2">
                <Field label="Event date & time" htmlFor="c-event">
                  <Input
                    id="c-event"
                    type="datetime-local"
                    value={form.eventStartAt}
                    onChange={(e) => set('eventStartAt', e.target.value)}
                  />
                </Field>
                <Field label="Venue" htmlFor="c-venue">
                  <Input
                    id="c-venue"
                    value={form.eventLocation}
                    maxLength={200}
                    onChange={(e) => set('eventLocation', e.target.value)}
                    placeholder="e.g. YEGO Secretariat, Abuja"
                  />
                </Field>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="External video link" htmlFor="c-video" hint="YouTube or Vimeo links are embedded safely; other links show as a button.">
                <Input
                  id="c-video"
                  value={form.videoUrl}
                  onChange={(e) => set('videoUrl', e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
              </Field>
              <Field label="External resource link" htmlFor="c-resource" hint="Optional extra reading link.">
                <Input
                  id="c-resource"
                  value={form.resourceUrl}
                  onChange={(e) => set('resourceUrl', e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>

            <MediaSection
              form={form}
              set={set}
              featuredInput={featuredInput}
              galleryInput={galleryInput}
              attachmentInput={attachmentInput}
            />

            <div className="rounded-lg border bg-muted/30 p-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <Checkbox
                  checked={lockedPublished || form.publish}
                  onCheckedChange={(value) => set('publish', value === true)}
                  disabled={lockedPublished}
                />
                Publish now
                {lockedPublished && (
                  <span className="text-xs font-normal text-muted-foreground">
                    — this item is live; use “Unpublish” on the list to take it down.
                  </span>
                )}
              </label>
              {form.publish && restricted && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={form.notifyInApp} onCheckedChange={(value) => set('notifyInApp', value === true)} />
                    <span>
                      Notify the {form.audience} audience in the portal
                      <span className="block text-xs text-muted-foreground">Sent once per item, even if you publish again later.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={form.notifyEmail} onCheckedChange={(value) => set('notifyEmail', value === true)} />
                    <span>
                      Also notify by email (Resend)
                      <span className="block text-xs text-muted-foreground">Queued for verified recipients; sent in the background.</span>
                    </span>
                  </label>
                </div>
              )}
              {form.publish && !restricted && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Public content appears on the News &amp; Updates page. Portal notifications are only available for
                  applicant/guard audiences.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={busy}>
              <Eye /> Preview
            </Button>
            <Button variant="secondary" onClick={() => void save(false)} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} <CloudUpload /> Save draft
            </Button>
            <Button onClick={() => void save(true)} disabled={busy}>
              <Upload /> {editing ? 'Save & publish' : 'Publish now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewOpen && (
        <Dialog open onOpenChange={setPreviewOpen}>
          <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Eye className="size-4 text-primary" /> Draft preview
              </DialogTitle>
              <DialogDescription>How this item renders once published.</DialogDescription>
            </DialogHeader>
            <ContentArticle
              item={{
                id: form.id ?? 'preview',
                slug: slugValue,
                title: form.title || 'Untitled',
                summary: form.summary,
                body: form.body,
                category: form.category as ContentItem['category'],
                audience: form.audience,
                status: form.publish ? 'published' : 'draft',
                featuredImage: form.featuredImage,
                gallery: form.gallery,
                attachments: form.attachments,
                videoUrl: form.videoUrl || undefined,
                resourceUrl: form.resourceUrl || undefined,
                eventStartAt: form.eventStartAt || undefined,
                eventLocation: form.eventLocation || undefined,
                createdByLabel: 'You',
              } as ContentItem}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function MediaSection({
  form,
  set,
  featuredInput,
  galleryInput,
  attachmentInput,
}: {
  form: EditorState
  set: <K extends keyof EditorState>(key: K, value: EditorState[K]) => void
  featuredInput: React.RefObject<HTMLInputElement | null>
  galleryInput: React.RefObject<HTMLInputElement | null>
  attachmentInput: React.RefObject<HTMLInputElement | null>
}) {
  const [error, setError] = useState('')

  async function addImages(files: FileList | null, mode: 'featured' | 'gallery') {
    if (!files?.length) return
    setError('')
    try {
      if (mode === 'featured') {
        set('featuredImage', await readImage(files[0]))
      } else {
        const room = 4 - form.gallery.length
        if (room <= 0) throw new Error('Up to 4 gallery images.')
        const additions = await Promise.all(Array.from(files).slice(0, room).map((file) => readImage(file, 900, 0.78)))
        set(
          'gallery',
          [...form.gallery, ...additions.map((data, index) => ({ name: files[index]?.name ?? `Image ${index + 1}`, data }))],
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    }
  }

  async function addPdfs(files: FileList | null) {
    if (!files?.length) return
    setError('')
    try {
      const room = 4 - form.attachments.length
      if (room <= 0) throw new Error('Up to 4 attachments.')
      const additions = await Promise.all(Array.from(files).slice(0, room).map((file) => readPdf(file)))
      set(
        'attachments',
        [...form.attachments, ...additions.map((data, index) => ({ name: files[index]?.name ?? `Document ${index + 1}`, data }))],
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Media & documents</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold">Featured image</p>
          {form.featuredImage ? (
            <div className="relative mt-2 w-fit">
              <img src={form.featuredImage} alt="" className="h-24 rounded-md border object-cover" />
              <button
                type="button"
                onClick={() => set('featuredImage', undefined)}
                className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow"
                aria-label="Remove featured image"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => featuredInput.current?.click()}>
              <Upload /> Upload image
            </Button>
          )}
          <input
            ref={featuredInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              void addImages(e.target.files, 'featured')
              e.target.value = ''
            }}
          />
        </div>
        <div>
          <p className="text-xs font-semibold">Gallery ({form.gallery.length}/4)</p>
          {form.gallery.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {form.gallery.map((image, index) => (
                <span key={index} className="relative">
                  <img src={image.data} alt={image.name} className="size-16 rounded-md border object-cover" />
                  <button
                    type="button"
                    onClick={() => set('gallery', form.gallery.filter((_, i) => i !== index))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5 shadow"
                    aria-label={`Remove ${image.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => galleryInput.current?.click()}>
            <Upload /> Add images
          </Button>
          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              void addImages(e.target.files, 'gallery')
              e.target.value = ''
            }}
          />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold">PDF attachments ({form.attachments.length}/4)</p>
        {form.attachments.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {form.attachments.map((file, index) => (
              <li key={index} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                <FileText className="size-3.5 text-primary" /> {file.name}
                <button
                  type="button"
                  onClick={() => set('attachments', form.attachments.filter((_, i) => i !== index))}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => attachmentInput.current?.click()}>
          <Upload /> Attach PDF
        </Button>
        <input
          ref={attachmentInput}
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            void addPdfs(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  )
}
