/**
 * Private evidence storage for incident images and videos.
 *
 * Design notes:
 * - Files NEVER live in PostgreSQL. Only metadata (key, mime type, byte size)
 *   is stored in `incident_evidence`; the bytes go to object storage.
 * - Two drivers, selected by EVIDENCE_STORAGE ('auto' | 'netlify-blobs' | 'disk' | 'off'):
 *     * netlify-blobs — the private store of the Netlify deployment (production).
 *       No extra credentials needed inside Netlify Functions; the runtime injects
 *       the blob context automatically.
 *     * disk — local development, integration tests and the optional SmartWeb
 *       VPS deployment. Root directory via EVIDENCE_STORAGE_ROOT.
 * - Uploads are chunked (<= 3 MiB per server-function request) so large videos
 *   never pass through an oversized Netlify Function request and are never
 *   base64-encoded into the database. Each chunk lands directly in object
 *   storage; the final object is assembled only after the incident report that
 *   references it has been validated.
 * - Every upload ticket and every view URL is HMAC-signed with SESSION_SECRET,
 *   so clients can only write to server-chosen keys and can only read evidence
 *   through an authenticated, short-lived URL.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { AppError } from './security.server'

export type EvidenceKind = 'photo' | 'video' | 'document'

export const EVIDENCE_MIME_WHITELIST: Readonly<Record<string, EvidenceKind>> = {
  'image/jpeg': 'photo',
  'image/jpg': 'photo',
  'image/png': 'photo',
  'image/webp': 'photo',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'document',
}

export const EVIDENCE_EXT_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
}

export const EVIDENCE_SIZE_CAPS: Readonly<Record<EvidenceKind, number>> = {
  photo: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  document: 20 * 1024 * 1024,
}

export const EVIDENCE_MAX_FILES = 6
/** Raw bytes per upload chunk; base64 adds ~4/3, staying far below function limits. */
export const EVIDENCE_CHUNK_SIZE = 3 * 1024 * 1024
/** How long an upload ticket stays valid (client uploads the chunks in this window). */
export const EVIDENCE_TICKET_TTL_SECONDS = 2 * 60 * 60
/** How long a generated view URL stays valid before the UI must refresh it. */
export const EVIDENCE_VIEW_TTL_SECONDS = 10 * 60

const KEY_PATTERN = /^evidence\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|mp4|webm|mov|pdf)$/

function signingSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim()
  if (secret) return secret
  const local = process.env.NETLIFY_DEV === 'true' || ['development', 'test'].includes(process.env.NODE_ENV ?? '')
  if (!local) {
    throw new AppError('Evidence storage is not configured (missing SESSION_SECRET).', 503)
  }
  return 'yego-development-only'
}

function hmac(payload: string): string {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url')
}

export function signEvidenceTicket(storageKey: string, mimeType: string, byteSize: number, exp: number): string {
  return hmac(`${storageKey}|${mimeType}|${byteSize}|${exp}`)
}

export function verifyEvidenceTicket(
  storageKey: string,
  mimeType: string,
  byteSize: number,
  exp: number,
  sig: string,
): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false
  const expected = signEvidenceTicket(storageKey, mimeType, byteSize, exp)
  const a = Buffer.from(expected)
  const b = Buffer.from(sig ?? '')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function signEvidenceViewToken(evidenceId: string, exp: number): string {
  return hmac(`evidence-view|${evidenceId}|${exp}`)
}

export function verifyEvidenceViewToken(evidenceId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false
  const expected = signEvidenceViewToken(evidenceId, exp)
  const a = Buffer.from(expected)
  const b = Buffer.from(sig ?? '')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Server-chosen storage key — clients never control the object path. */
export function buildEvidenceKey(mimeType: string): { key: string; ext: string } {
  const ext = EVIDENCE_EXT_BY_MIME[mimeType]
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return { key: `evidence/${yyyy}/${mm}/${randomUUID()}.${ext}`, ext }
}

export function isValidEvidenceKey(key: string): boolean {
  return KEY_PATTERN.test(key)
}

/* Driver selection ----------------------------------------------------------- */

export type EvidenceStorageDriver = 'netlify-blobs' | 'disk' | 'off'

export function evidenceStorageDriver(): EvidenceStorageDriver {
  const configured = process.env.EVIDENCE_STORAGE?.trim().toLowerCase()
  if (configured === 'netlify-blobs' || configured === 'disk' || configured === 'off') return configured
  // 'auto': use Netlify Blobs when running inside Netlify Functions (context env
  // injected by the platform), otherwise fall back to local disk.
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.NETLIFY_BLOBS_CONTEXT) return 'netlify-blobs'
  return 'disk'
}

/* Disk driver ----------------------------------------------------------------- */

function diskRoot(): string {
  const configured = process.env.EVIDENCE_STORAGE_ROOT?.trim()
  if (configured) return path.resolve(configured)
  const local = process.env.NETLIFY_DEV === 'true' || ['development', 'test'].includes(process.env.NODE_ENV ?? '')
  if (!local) {
    throw new AppError('Evidence storage is not configured (set EVIDENCE_STORAGE_ROOT for disk storage).', 503)
  }
  return path.resolve(process.cwd(), 'data', 'evidence')
}

const diskPath = (key: string) => path.join(diskRoot(), key)
const partSuffix = (partIndex: number) => `.parts/${String(partIndex).padStart(6, '0')}`

async function diskPutChunk(key: string, partIndex: number, data: Buffer): Promise<{ bytes: number }> {
  const target = diskPath(key + partSuffix(partIndex))
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, data)
  return { bytes: data.byteLength }
}

async function diskSize(key: string): Promise<number | null> {
  try {
    const info = await stat(diskPath(key))
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

async function diskFinalize(key: string, parts: number, expectedSize: number): Promise<{ size: number }> {
  const dir = diskPath(key + '.parts')
  let size = 0
  for (let index = 0; index < parts; index += 1) {
    const chunk = await readFile(diskPath(key + partSuffix(index)))
    size += chunk.byteLength
    // Append part-by-part to keep memory bounded for large videos.
    const { appendFile } = await import('node:fs/promises')
    if (index === 0) {
      await mkdir(path.dirname(diskPath(key)), { recursive: true })
      await rm(diskPath(key), { force: true })
      await writeFile(diskPath(key), chunk)
    } else {
      await appendFile(diskPath(key), chunk)
    }
  }
  await rm(dir, { recursive: true, force: true })
  if (size !== expectedSize) {
    await rm(diskPath(key), { force: true })
    throw new AppError(`Uploaded file size mismatch (received ${size} bytes, expected ${expectedSize}).`, 400)
  }
  return { size }
}

async function diskRead(
  key: string,
  range?: { start: number; end: number },
): Promise<{ body: Buffer; size: number; contentType: string } | null> {
  const size = await diskSize(key)
  if (size == null) return null
  const buffer = await readFile(diskPath(key))
  const body = range ? buffer.subarray(range.start, range.end + 1) : buffer
  return { body, size, contentType: 'application/octet-stream' }
}

/* Netlify Blobs driver -------------------------------------------------------- */

async function blobStore() {
  const { getStore } = await import('@netlify/blobs')
  return getStore({ name: process.env.EVIDENCE_BLOB_STORE?.trim() || 'incident-evidence', consistency: 'strong' })
}

/* Public adapter -------------------------------------------------------------- */

export async function putEvidenceChunk(storageKey: string, partIndex: number, data: Buffer): Promise<{ bytes: number }> {
  const driver = evidenceStorageDriver()
  if (driver === 'off') throw new AppError('Evidence storage is disabled on this deployment.', 503)
  if (driver === 'disk') return diskPutChunk(storageKey, partIndex, data)
  const store = await blobStore()
  await store.set(storageKey + partSuffix(partIndex), new Blob([new Uint8Array(data)]))
  return { bytes: data.byteLength }
}

/** Assemble the uploaded parts into the final object and verify the byte size. */
export async function finalizeEvidence(storageKey: string, parts: number, expectedSize: number): Promise<{ size: number }> {
  const driver = evidenceStorageDriver()
  if (driver === 'off') throw new AppError('Evidence storage is disabled on this deployment.', 503)
  if (driver === 'disk') return diskFinalize(storageKey, parts, expectedSize)

  const store = await blobStore()
  const chunks: Uint8Array[] = []
  let size = 0
  for (let index = 0; index < parts; index += 1) {
    const partKey = storageKey + partSuffix(index)
    let chunk: ArrayBuffer
    try {
      chunk = await store.get(partKey, { type: 'arrayBuffer' })
    } catch {
      throw new AppError(`Uploaded part ${index + 1} of ${parts} is missing. Please upload the file again.`, 400)
    }
    chunks.push(new Uint8Array(chunk))
    size += chunk.byteLength
  }
  if (size !== expectedSize) {
    throw new AppError(`Uploaded file size mismatch (received ${size} bytes, expected ${expectedSize}).`, 400)
  }
  const assembled = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    assembled.set(chunk, offset)
    offset += chunk.byteLength
  }
  await store.set(storageKey, new Blob([assembled]))
  for (let index = 0; index < parts; index += 1) {
    await store.delete(storageKey + partSuffix(index)).catch(() => {})
  }
  return { size }
}

export async function evidenceExists(storageKey: string): Promise<boolean> {
  const driver = evidenceStorageDriver()
  if (driver === 'off') return false
  if (driver === 'disk') return (await diskSize(storageKey)) != null
  const store = await blobStore()
  return (await store.getMetadata(storageKey)) != null
}

export async function removeEvidence(storageKey: string): Promise<void> {
  const driver = evidenceStorageDriver()
  if (driver === 'off') return
  if (driver === 'disk') {
    await rm(diskPath(storageKey), { force: true })
    await rm(diskPath(storageKey + '.parts'), { recursive: true, force: true }).catch(() => {})
    return
  }
  const store = await blobStore()
  await store.delete(storageKey).catch(() => {})
}

/** Read the object (optionally a byte range) for authenticated streaming. */
export async function readEvidence(
  storageKey: string,
  range?: { start: number; end: number },
): Promise<{ body: Buffer; size: number; contentType: string } | null> {
  const driver = evidenceStorageDriver()
  if (driver === 'off') return null
  if (driver === 'disk') return diskRead(storageKey, range)
  const store = await blobStore()
  try {
    const buffer = await store.get(storageKey, { type: 'arrayBuffer' })
    const bytes = new Uint8Array(buffer)
    const body = range ? bytes.subarray(range.start, range.end + 1) : bytes
    return { body: Buffer.from(body), size: bytes.byteLength, contentType: 'application/octet-stream' }
  } catch {
    return null
  }
}
