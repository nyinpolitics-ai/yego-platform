// Content Management System server layer.
//
// Every function enforces its capability server-side via requireCapability,
// records an audit_log entry, and follows the platform conventions: parameter-
// ised SQL through the shared pool, transactions for multi-row writes, and
// soft deletion (deleted_at) so content is recoverable.
//
// Notification fan-out is exactly-once per content item: the
// `notification_sent_at` claim is set in the same transaction that inserts the
// in-app notifications and queues the outbound emails, so retried publications
// can never duplicate deliveries. Email delivery reuses the existing
// outbound_messages queue (Resend) and never blocks or fails the publication.

import type { PoolClient } from 'pg'

import { audit, requireCapability } from './auth.server'
import { one, query, transaction } from './db.server'
import {
  escapeLike,
  safeHttpUrl,
  slugify,
  type ContentAudience,
  type ContentCategory,
  type ContentItem,
  type ContentStatus,
  type ContentTeaser,
} from '@/lib/content'
import { notifyConfig, deliverEmailIds, processPendingEmails } from './notify.server'
import { AppError } from './security.server'
import type { AuthUser } from './scope.server'

const SITE_ORIGIN = process.env.SITE_URL?.trim() || 'https://yego.ng'

// Safety caps for a single notification fan-out (blast protection).
const IN_APP_CAP = 50_000
const EMAIL_CAP = 5_000
const NOTIFICATION_CHUNK = 500
const EMAIL_CHUNK = 100
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const PAGE_SIZE = 12
const CMS_PAGE_SIZE = 20
const PORTAL_LIMIT = 30

/* Row mapping ---------------------------------------------------------------- */

interface ContentRow {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  category: ContentCategory
  audience: ContentAudience
  status: ContentStatus
  featured_image: string | null
  gallery: { name: string; data: string }[] | null
  attachments: { name: string; data: string }[] | null
  video_url: string | null
  resource_url: string | null
  event_start_at: Date | null
  event_location: string | null
  created_by: string | null
  created_by_label: string
  updated_by: string | null
  updated_by_label: string | null
  published_at: Date | null
  published_by: string | null
  published_by_label: string | null
  notify_in_app: boolean
  notify_email: boolean
  notification_sent_at: Date | null
  deleted_at: Date | null
  deleted_by: string | null
  created_at: Date
  updated_at: Date
}

const iso = (value: Date | null): string | undefined => (value ? value.toISOString() : undefined)

export function mapContent(row: ContentRow): ContentItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    audience: row.audience,
    status: row.status,
    featuredImage: row.featured_image ?? undefined,
    gallery: row.gallery ?? [],
    attachments: row.attachments ?? [],
    videoUrl: row.video_url ?? undefined,
    resourceUrl: row.resource_url ?? undefined,
    eventStartAt: iso(row.event_start_at),
    eventLocation: row.event_location ?? undefined,
    createdByLabel: row.created_by_label,
    updatedByLabel: row.updated_by_label ?? undefined,
    publishedAt: iso(row.published_at),
    publishedByLabel: row.published_by_label ?? undefined,
    notifyInApp: row.notify_in_app,
    notifyEmail: row.notify_email,
    notificationSentAt: iso(row.notification_sent_at),
    deletedAt: iso(row.deleted_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function mapTeaser(row: ContentRow): ContentTeaser {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    featuredImage: row.featured_image ?? undefined,
    videoUrl: row.video_url ?? undefined,
    eventStartAt: iso(row.event_start_at),
    eventLocation: row.event_location ?? undefined,
    publishedAt: iso(row.published_at),
    publishedByLabel: row.published_by_label ?? undefined,
  }
}

/* Input helpers -------------------------------------------------------------- */

export interface ContentWriteInput {
  title: string
  slug?: string
  summary: string
  body: string
  category: ContentCategory
  audience: ContentAudience
  featuredImage?: string
  gallery: { name: string; data: string }[]
  attachments: { name: string; data: string }[]
  videoUrl?: string
  resourceUrl?: string
  eventStartAt?: string
  eventLocation?: string
  publish: boolean
  notifyInApp: boolean
  notifyEmail: boolean
}

function actorLabel(user: AuthUser): string {
  return `${user.name} (${user.role})`
}

function requireSafeUrl(value: string | undefined, label: string): string | null {
  if (!value) return null
  const url = safeHttpUrl(value)
  if (!url) throw new AppError(`The ${label} must be a valid http(s) web address.`, 400)
  return url
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base)
  let candidate = root
  let counter = 2
  for (;;) {
    const existing = await one<{ id: string }>('select id from content_items where slug = $1', [candidate])
    if (!existing || (excludeId && existing.id === excludeId)) return candidate
    candidate = `${root.slice(0, 110)}-${counter}`
    counter += 1
  }
}

async function loadContentRow(id: string, options: { allowDeleted?: boolean } = {}): Promise<ContentRow> {
  const row = await one<ContentRow>('select * from content_items where id = $1', [id])
  if (!row || (row.deleted_at && !options.allowDeleted)) throw new AppError('Content not found.', 404)
  return row
}

/* Recipients ----------------------------------------------------------------- */

/**
 * Portal recipients for an audience. The platform has one identity model: a
 * guard-kind user row linked to an application. Guards are applications with
 * status 'Certified/Active'; everyone else is an applicant.
 */
async function contentRecipients(audience: ContentAudience): Promise<{ userId: string; email: string | null }[]> {
  if (audience === 'public') return []
  const statusClause =
    audience === 'guards'
      ? "and a.status = 'Certified/Active'"
      : audience === 'applicants'
        ? "and a.status <> 'Certified/Active'"
        : ''
  const rows = await query<{ user_id: string; email: string | null }>(
    `select u.id as user_id, a.email
     from users u join applications a on a.id = u.application_id
     where u.kind = 'guard' and u.active and u.application_id is not null ${statusClause}
     order by u.created_at`,
  )
  return rows.rows.map((row) => ({ userId: row.user_id, email: row.email }))
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

/* Branded notification email -------------------------------------------------- */

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderContentNotificationEmail(input: {
  title: string
  category: string
  summary: string
  publishedAt?: string
  viewUrl: string
  siteUrl: string
  audience: ContentAudience
}): { subject: string; text: string; html: string } {
  const title = esc(input.title)
  const category = esc(input.category)
  const summary = esc(input.summary)
  const subject = `YEGO ${input.category}: ${input.title}`
  const text = [
    'NEW ON THE YEGO PLATFORM',
    '',
    `${input.category}: ${input.title}`,
    '',
    input.summary,
    '',
    `Read the full update: ${input.viewUrl}`,
    '',
    `Published: ${input.publishedAt ?? 'just now'} · ${input.siteUrl}`,
    '',
    'You received this email because you are part of the YEGO audience selected for this publication.',
    'Youth Electoral Guards Observers · info@yego.ng',
  ].join('\n')
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef2ef;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:16px">
    <div style="background:#0b6b3a;border-radius:12px 12px 0 0;padding:22px 28px">
      <span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:2px">YEGO</span>
      <span style="color:#f5c542;font-size:12px;font-weight:600;margin-left:10px;letter-spacing:0.5px">Youth Electoral Guards Observers</span>
    </div>
    <div style="background:#ffffff;border:1px solid #dde5df;border-top:none;padding:28px 28px 24px">
      <p style="margin:0 0 10px;color:#0b6b3a;font-size:12px;font-weight:bold;letter-spacing:1px">${category.toUpperCase()}</p>
      <h1 style="margin:0 0 12px;color:#17281f;font-size:22px;line-height:1.35">${title}</h1>
      <p style="margin:0 0 20px;color:#3c4a42;font-size:14px;line-height:1.65">${summary}</p>
      <p style="margin:0 0 22px">
        <a href="${esc(input.viewUrl)}" style="display:inline-block;background:#0b6b3a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;font-size:15px">Read the full update</a>
      </p>
      <p style="margin:0 0 18px;color:#8a978f;font-size:12px">
        Published ${esc(input.publishedAt ?? 'today')} · <a href="${esc(input.siteUrl)}" style="color:#0b6b3a">${esc(input.siteUrl)}</a>
      </p>
      <div style="border-top:1px solid #eef2ef;padding-top:14px">
        <p style="margin:0;color:#5b6a61;font-size:12px;line-height:1.6">
          You received this email because you are part of the YEGO audience selected for this publication.<br>
          Youth Electoral Guards Observers · info@yego.ng
        </p>
      </div>
    </div>
  </div>
</body></html>`
  return { subject, text, html }
}

/* Exactly-once fan-out (call inside a transaction with the row locked) -------- */

interface FanOutResult {
  queuedEmailIds: string[]
  inAppCount: number
  skipped: boolean
}

async function notifyWithinTransaction(
  client: PoolClient,
  item: ContentRow,
  notifyInApp: boolean,
  notifyEmail: boolean,
): Promise<FanOutResult> {
  const empty: FanOutResult = { queuedEmailIds: [], inAppCount: 0, skipped: true }
  if (!(notifyInApp || notifyEmail) || item.audience === 'public') return empty

  const recipients = await contentRecipients(item.audience)
  const emailRecipients = recipients.filter((recipient) => recipient.email && EMAIL_RE.test(recipient.email))
  if (recipients.length > IN_APP_CAP) {
    throw new AppError(
      `This audience has ${recipients.length} recipients — too many for one notification. Narrow the audience or contact the Super Administrator.`,
      400,
    )
  }
  if (emailRecipients.length > EMAIL_CAP) {
    throw new AppError(
      `Email fan-out would reach ${emailRecipients.length} recipients — above the safety limit. Narrow the audience or disable the email notification.`,
      400,
    )
  }

  // Exactly-once claim: a concurrent or repeated publish finds the slot taken.
  const claim = await client.query(
    'update content_items set notification_sent_at = now() where id = $1 and notification_sent_at is null returning id',
    [item.id],
  )
  if (!claim.rowCount) return empty

  let inAppCount = 0
  if (notifyInApp && recipients.length) {
    for (const batch of chunk(recipients, NOTIFICATION_CHUNK)) {
      const values: unknown[] = []
      const placeholders = batch.map((recipient, index) => {
        const base = index * 4
        values.push(recipient.userId, item.title, item.summary, item.id)
        return `($${base + 1}, 'content', $${base + 2}, $${base + 3}, 'content', $${base + 4})`
      })
      await client.query(
        `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
         values ${placeholders.join(',')}
         on conflict do nothing`,
        values,
      )
      inAppCount += batch.length
    }
  }

  const queuedEmailIds: string[] = []
  if (notifyEmail && emailRecipients.length) {
    const config = notifyConfig()
    const viewUrl = `${SITE_ORIGIN}/portal`
    const mail = renderContentNotificationEmail({
      title: item.title,
      category: item.category,
      summary: item.summary || item.title,
      publishedAt: (item.published_at ?? new Date()).toISOString().slice(0, 10),
      viewUrl,
      siteUrl: SITE_ORIGIN,
      audience: item.audience,
    })
    const status = config.email ? 'queued' : 'skipped'
    const provider = config.email ? 'resend' : 'no-provider'
    for (const batch of chunk(emailRecipients, EMAIL_CHUNK)) {
      const values: unknown[] = batch.map((recipient) => recipient.email)
      const placeholders = batch
        .map((_, index) => `($${index + 1}, 'email', 'content.published', $${batch.length + 1}, $${batch.length + 2}, $${batch.length + 3}, 'content', $${batch.length + 4}, $${batch.length + 5}, $${batch.length + 6})`)
      values.push(mail.subject, mail.text, mail.html, item.id, status, provider)
      const inserted = await client.query<{ id: string }>(
        `insert into outbound_messages (to_email, channel, template, subject, body, html, related_type, related_id, status, provider)
         values ${placeholders.join(',')}
         returning id`,
        values,
      )
      if (config.email) for (const row of inserted.rows) queuedEmailIds.push(row.id)
    }
  }
  return { queuedEmailIds, inAppCount, skipped: false }
}

async function deliverQueued(ids: string[]): Promise<void> {
  if (!ids.length) return
  void deliverEmailIds(ids).catch(() => {})
}

/* CMS actions (capability-gated) ---------------------------------------------- */

export async function createContent(user: AuthUser, input: ContentWriteInput): Promise<ContentItem> {
  requireCapability(user, 'create:content')
  if (input.publish) requireCapability(user, 'publish:content')
  const videoUrl = requireSafeUrl(input.videoUrl, 'video link')
  const resourceUrl = requireSafeUrl(input.resourceUrl, 'resource link')
  const slug = await uniqueSlug(input.slug?.trim() || input.title)

  const row = await transaction(async (client) => {
    const inserted = await client.query<ContentRow>(
      `insert into content_items
        (slug, title, summary, body, category, audience, status, featured_image, gallery, attachments,
         video_url, resource_url, event_start_at, event_location,
         created_by, created_by_label, updated_by, updated_by_label,
         published_at, published_by, published_by_label)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$15,$16,$17,$15,$16)
       returning *`,
      [
        slug,
        input.title,
        input.summary,
        input.body,
        input.category,
        input.audience,
        input.publish ? 'published' : 'draft',
        input.featuredImage ?? null,
        JSON.stringify(input.gallery ?? []),
        JSON.stringify(input.attachments ?? []),
        videoUrl,
        resourceUrl,
        input.eventStartAt ? new Date(input.eventStartAt) : null,
        input.eventLocation ?? null,
        user.id,
        actorLabel(user),
        input.publish ? new Date() : null,
      ],
    )
    if (!inserted.rows[0]) throw new AppError('Could not save the content item.', 500)
    return inserted.rows[0]
  })

  await audit(user, 'content.created', 'content', row.id, {
    slug: row.slug,
    category: row.category,
    audience: row.audience,
    published: input.publish,
  })

  if (input.publish) {
    const fanOut = await transaction(async (client) => {
      const locked = await client.query<ContentRow>('select * from content_items where id = $1 for update', [row.id])
      return notifyWithinTransaction(client, locked.rows[0], input.notifyInApp, input.notifyEmail)
    })
    await deliverQueued(fanOut.queuedEmailIds)
    if (!fanOut.skipped) {
      await audit(user, 'content.notification_initiated', 'content', row.id, {
        inApp: fanOut.inAppCount,
        email: fanOut.queuedEmailIds.length,
      })
    }
  }
  return mapContent(row)
}

export async function updateContent(user: AuthUser, id: string, input: ContentWriteInput): Promise<ContentItem> {
  requireCapability(user, 'edit:content')
  const existing = await loadContentRow(id)
  const becomesPublished = input.publish && existing.status !== 'published'
  if (becomesPublished) requireCapability(user, 'publish:content')
  const videoUrl = requireSafeUrl(input.videoUrl, 'video link')
  const resourceUrl = requireSafeUrl(input.resourceUrl, 'resource link')
  const slug = await uniqueSlug(input.slug?.trim() || input.title, id)

  const { row, fanOut } = await transaction(async (client) => {
    const locked = await client.query<ContentRow>('select * from content_items where id = $1 for update', [id])
    if (!locked.rows[0]) throw new AppError('Content not found.', 404)
    const updated = await client.query<ContentRow>(
      `update content_items set
         slug = $2, title = $3, summary = $4, body = $5, category = $6, audience = $7,
         featured_image = $8, gallery = $9, attachments = $10,
         video_url = $11, resource_url = $12, event_start_at = $13, event_location = $14,
         updated_by = $15, updated_by_label = $16,
         status = case when $17 then 'published' else content_items.status end,
         published_at = case when $17 then coalesce(published_at, now()) else published_at end,
         published_by = case when $17 then $15 else published_by end,
         published_by_label = case when $17 then $16 else published_by_label end,
         notify_in_app = $18, notify_email = $19
       where id = $1
       returning *`,
      [
        id,
        slug,
        input.title,
        input.summary,
        input.body,
        input.category,
        input.audience,
        input.featuredImage ?? null,
        JSON.stringify(input.gallery ?? []),
        JSON.stringify(input.attachments ?? []),
        videoUrl,
        resourceUrl,
        input.eventStartAt ? new Date(input.eventStartAt) : null,
        input.eventLocation ?? null,
        user.id,
        actorLabel(user),
        becomesPublished,
        input.notifyInApp,
        input.notifyEmail,
      ],
    )
    if (!updated.rows[0]) throw new AppError('Could not update the content item.', 500)
    // Editing an already-published item never re-notifies: the fan-out only
    // runs when this update is the transition into 'published'.
    const fanOut = becomesPublished
      ? await notifyWithinTransaction(client, updated.rows[0], input.notifyInApp, input.notifyEmail)
      : { queuedEmailIds: [] as string[], inAppCount: 0, skipped: true }
    return { row: updated.rows[0], fanOut }
  })

  await deliverQueued(fanOut.queuedEmailIds)
  await audit(user, 'content.updated', 'content', row.id, {
    slug: row.slug,
    was: existing.status,
    now: row.status,
    notified: !fanOut.skipped,
  })
  if (!fanOut.skipped) {
    await audit(user, 'content.notification_initiated', 'content', row.id, {
      inApp: fanOut.inAppCount,
      email: fanOut.queuedEmailIds.length,
    })
  }
  return mapContent(row)
}

export async function getContent(user: AuthUser, id: string): Promise<ContentItem> {
  requireCapability(user, 'view:content')
  const row = await loadContentRow(id, { allowDeleted: true })
  return mapContent(row)
}

export async function publishContent(
  user: AuthUser,
  input: { id: string; notifyInApp: boolean; notifyEmail: boolean },
): Promise<ContentItem> {
  requireCapability(user, 'publish:content')
  const { row, fanOut } = await transaction(async (client) => {
    const locked = await client.query<ContentRow>('select * from content_items where id = $1 for update', [input.id])
    if (!locked.rows[0] || locked.rows[0].deleted_at) throw new AppError('Content not found.', 404)
    const current = locked.rows[0]
    const wasPublished = current.status === 'published'
    const updated = await client.query<ContentRow>(
      `update content_items set
         status = 'published',
         published_at = coalesce(published_at, now()),
         published_by = $2, published_by_label = $3,
         updated_by = $2, updated_by_label = $3,
         notify_in_app = $4, notify_email = $5
       where id = $1
       returning *`,
      [input.id, user.id, actorLabel(user), input.notifyInApp, input.notifyEmail],
    )
    if (!updated.rows[0]) throw new AppError('Could not publish the content item.', 500)
    // Re-publishing an already-published item (e.g. only changing audience)
    // never re-notifies: the claim below stays taken.
    const fanOut = wasPublished
      ? { queuedEmailIds: [] as string[], inAppCount: 0, skipped: true }
      : await notifyWithinTransaction(client, updated.rows[0], input.notifyInApp, input.notifyEmail)
    return { row: updated.rows[0], fanOut }
  })

  await deliverQueued(fanOut.queuedEmailIds)
  await audit(user, 'content.published', 'content', row.id, { slug: row.slug, audience: row.audience })
  if (!fanOut.skipped) {
    await audit(user, 'content.notification_initiated', 'content', row.id, {
      inApp: fanOut.inAppCount,
      email: fanOut.queuedEmailIds.length,
    })
  }
  return mapContent(row)
}

export async function unpublishContent(user: AuthUser, id: string): Promise<ContentItem> {
  requireCapability(user, 'unpublish:content')
  const existing = await loadContentRow(id)
  if (existing.status !== 'published' && existing.status !== 'archived') {
    throw new AppError('Only published or archived content can be unpublished.', 400)
  }
  const row = await one<ContentRow>(
    `update content_items set status = 'draft', updated_by = $2, updated_by_label = $3 where id = $1 returning *`,
    [id, user.id, actorLabel(user)],
  )
  if (!row) throw new AppError('Could not unpublish the content item.', 500)
  await audit(user, 'content.unpublished', 'content', row.id, { slug: row.slug })
  return mapContent(row)
}

export async function archiveContent(user: AuthUser, id: string): Promise<ContentItem> {
  requireCapability(user, 'archive:content')
  const existing = await loadContentRow(id)
  if (existing.status === 'archived') return mapContent(existing)
  const row = await one<ContentRow>(
    `update content_items set status = 'archived', updated_by = $2, updated_by_label = $3 where id = $1 returning *`,
    [id, user.id, actorLabel(user)],
  )
  if (!row) throw new AppError('Could not archive the content item.', 500)
  await audit(user, 'content.archived', 'content', row.id, { slug: row.slug })
  return mapContent(row)
}

export async function deleteContent(user: AuthUser, id: string): Promise<ContentItem> {
  requireCapability(user, 'delete:content')
  const existing = await loadContentRow(id)
  if (existing.deleted_at) return mapContent(existing)
  const row = await one<ContentRow>(
    `update content_items set deleted_at = now(), deleted_by = $2 where id = $1 returning *`,
    [id, user.id],
  )
  if (!row) throw new AppError('Could not delete the content item.', 500)
  await audit(user, 'content.deleted', 'content', row.id, { slug: existing.slug, soft: true })
  return mapContent(row)
}

export async function restoreContent(user: AuthUser, id: string): Promise<ContentItem> {
  requireCapability(user, 'delete:content')
  const existing = await loadContentRow(id, { allowDeleted: true })
  if (!existing.deleted_at) return mapContent(existing)
  const row = await one<ContentRow>(
    `update content_items set deleted_at = null, deleted_by = null where id = $1 returning *`,
    [id],
  )
  if (!row) throw new AppError('Could not restore the content item.', 500)
  await audit(user, 'content.restored', 'content', row.id, { slug: row.slug })
  return mapContent(row)
}

export interface ContentStats {
  total: number
  published: number
  draft: number
  archived: number
  deleted: number
}

export interface ContentListResult {
  rows: ContentItem[]
  stats: ContentStats
  page: number
  pageSize: number
  totalRows: number
}

export async function listContent(
  user: AuthUser,
  filter: { q?: string; category?: ContentCategory; status: 'all' | ContentStatus | 'deleted'; page: number },
): Promise<ContentListResult> {
  requireCapability(user, 'view:content')

  const statsRow = await one<{ total: string; published: string; draft: string; archived: string; deleted: string }>(
    `select count(*) filter (where deleted_at is null) as total,
            count(*) filter (where deleted_at is null and status = 'published') as published,
            count(*) filter (where deleted_at is null and status = 'draft') as draft,
            count(*) filter (where deleted_at is null and status = 'archived') as archived,
            count(*) filter (where deleted_at is not null) as deleted
     from content_items`,
  )
  const stats: ContentStats = {
    total: Number(statsRow?.total ?? 0),
    published: Number(statsRow?.published ?? 0),
    draft: Number(statsRow?.draft ?? 0),
    archived: Number(statsRow?.archived ?? 0),
    deleted: Number(statsRow?.deleted ?? 0),
  }

  const conditions: string[] = []
  const params: unknown[] = []
  if (filter.status === 'deleted') conditions.push('deleted_at is not null')
  else conditions.push('deleted_at is null')
  if (filter.status === 'draft' || filter.status === 'published' || filter.status === 'archived') {
    params.push(filter.status)
    conditions.push(`status = $${params.length}`)
  }
  if (filter.category) {
    params.push(filter.category)
    conditions.push(`category = $${params.length}`)
  }
  if (filter.q?.trim()) {
    params.push(`%${escapeLike(filter.q.trim())}%`)
    const index = params.length
    conditions.push(`(title ilike $${index} or summary ilike $${index} or slug ilike $${index})`)
  }
  const whereSql = conditions.length ? `where ${conditions.join(' and ')}` : ''

  const totalRows = Number(
    (
      await one<{ n: string }>(`select count(*) as n from content_items ${whereSql}`, params)
    )?.n ?? 0,
  )
  const offset = (filter.page - 1) * CMS_PAGE_SIZE
  params.push(CMS_PAGE_SIZE, offset)
  const rows = (
    await query<ContentRow>(
      `select * from content_items ${whereSql} order by updated_at desc limit $${params.length - 1} offset $${params.length}`,
      params,
    )
  ).rows

  return { rows: rows.map(mapContent), stats, page: filter.page, pageSize: CMS_PAGE_SIZE, totalRows }
}

/** Drain queued/failed content emails through the existing Resend pipeline. */
export async function retryContentEmails(user: AuthUser): Promise<{ sent: number; failed: number; skipped: number }> {
  requireCapability(user, 'view:content')
  const result = await processPendingEmails(50, 'content')
  await audit(user, 'content.notification_retry', 'content', 'queue', { ...result })
  return result
}

/* Public readers (no authentication; restricted fields never leave) ------------ */

export async function listPublicContent(filter: {
  category?: ContentCategory
  q?: string
  page: number
}): Promise<{ rows: ContentTeaser[]; totalRows: number; page: number; pageSize: number }> {
  const conditions = ["deleted_at is null", "status = 'published'", "audience = 'public'"]
  const params: unknown[] = []
  if (filter.category) {
    params.push(filter.category)
    conditions.push(`category = $${params.length}`)
  }
  if (filter.q?.trim()) {
    params.push(`%${escapeLike(filter.q.trim())}%`)
    const index = params.length
    conditions.push(`(title ilike $${index} or summary ilike $${index})`)
  }
  const whereSql = `where ${conditions.join(' and ')}`
  const totalRows = Number((await one<{ n: string }>(`select count(*) as n from content_items ${whereSql}`, params))?.n ?? 0)
  params.push(PAGE_SIZE, (filter.page - 1) * PAGE_SIZE)
  const rows = (
    await query<ContentRow>(
      `select * from content_items ${whereSql} order by published_at desc limit $${params.length - 1} offset $${params.length}`,
      params,
    )
  ).rows
  return { rows: rows.map(mapTeaser), totalRows, page: filter.page, pageSize: PAGE_SIZE }
}

export async function getPublicContentBySlug(slug: string): Promise<ContentItem> {
  const row = await one<ContentRow>(
    "select * from content_items where slug = $1 and status = 'published' and audience = 'public' and deleted_at is null",
    [slug],
  )
  if (!row) throw new AppError('Content not found.', 404)
  return mapContent(row)
}

/* Portal reader (authenticated applicants + guards) ---------------------------- */

export async function listPortalContent(user: AuthUser): Promise<ContentItem[]> {
  if (user.kind !== 'guard' || !user.application_id) return []
  const app = await one<{ status: string }>('select status from applications where id = $1', [user.application_id])
  const isGuard = app?.status === 'Certified/Active'
  const audiences: ContentAudience[] = isGuard ? ['public', 'guards', 'all'] : ['public', 'applicants', 'all']
  const rows = (
    await query<ContentRow>(
      `select * from content_items
       where deleted_at is null and status = 'published' and audience = any($1)
       order by published_at desc limit $2`,
      [audiences, PORTAL_LIMIT],
    )
  ).rows
  return rows.map(mapContent)
}
