// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  archiveContent,
  createContent,
  deleteContent,
  getContent,
  getPublicContentBySlug,
  listContent,
  listPortalContent,
  listPublicContent,
  publishContent,
  restoreContent,
  unpublishContent,
  updateContent,
} from '@/server/content.server'
import { mapAuthUser } from '@/server/auth.server'
import { createApplication, listCommandUsers, setApplicationStatus } from '@/server/repo.server'
import { query } from '@/server/db.server'
import type { ContentAudience, ContentCategory } from '@/lib/content'
import type { AuthUser } from '@/server/scope.server'

const stamp = Date.now().toString(36)
let counter = 0
const createdApplications: string[] = []
const createdUsers: string[] = []
const createdContent: string[] = []

function nextPhone() {
  counter += 1
  return `0805${String(1000000 + counter).slice(-7)}`
}

async function makeApplication(overrides: Record<string, unknown> = {}): Promise<{ publicId: string; uuid: string }> {
  counter += 1
  const { application } = await createApplication({
    fullName: `CMS Test ${stamp}${counter}`,
    gender: 'Female',
    dateOfBirth: '1998-05-10',
    phone: nextPhone(),
    whatsapp: nextPhone(),
    nin: String(10000000000 + counter).slice(-11),
    email: `cms-test-${stamp}-${counter}@example.ng`,
    stateOfOrigin: 'Kano',
    stateOfResidence: 'Kano',
    lga: 'Nasarawa',
    ward: 'Gwagwarwa',
    pollingUnit: 'PU 012 – Gwagwarwa Pri. Sch.',
    background: 'Student (tertiary)',
    experience: '',
    photo:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    nonPartisan: true,
    codeOfConduct: true,
    dataConsent: true,
    ...overrides,
  })
  createdApplications.push(application.id)
  const row = await query<{ id: string }>('select id from applications where public_id = $1', [application.id])
  return { publicId: application.id, uuid: row.rows[0].id }
}

async function makeGuardUser(applicationUuid: string): Promise<AuthUser> {
  counter += 1
  const row = await query<Record<string, unknown>>(
    `insert into users (email, password_hash, name, role, kind, scope_kind, scope_state, scope_lga, application_id)
     values ($1,'test-only','CMS Test Guard','YEGO Guard','guard','self','Kano','Nasarawa',$2) returning *`,
    [`guard-cms-${stamp}-${counter}@yego.local`, applicationUuid],
  )
  createdUsers.push(String(row.rows[0].id))
  return mapAuthUser(row.rows[0])
}

/** Certified guard: application linked, active user, email verified. */
async function makeCertifiedGuard(): Promise<{ user: AuthUser; applicationId: string }> {
  const application = await makeApplication()
  const user = await makeGuardUser(application.uuid)
  await query(`update applications set status = 'Certified/Active', email_verified_at = now() where id = $1`, [
    application.uuid,
  ])
  return { user, applicationId: application.uuid }
}

/** Applicant (not yet certified): portal user with a verified email. */
async function makeVerifiedApplicant(): Promise<{ user: AuthUser; applicationId: string }> {
  const application = await makeApplication()
  const user = await makeGuardUser(application.uuid)
  await query(`update applications set email_verified_at = now() where id = $1`, [application.uuid])
  return { user, applicationId: application.uuid }
}

function contentInput(overrides: Record<string, unknown> = {}) {
  counter += 1
  return {
    title: `CMS Integration Publication ${stamp} ${counter}`,
    summary: 'Integration test summary',
    body: 'Body text with **bold** and <script>alert(1)</script> literal.',
    category: 'News' as ContentCategory,
    audience: 'public' as ContentAudience,
    gallery: [],
    attachments: [],
    publish: false,
    notifyInApp: false,
    notifyEmail: false,
    ...overrides,
  }
}

let superadmin: AuthUser
let contentAdmin: AuthUser
let nationalAdmin: AuthUser

beforeAll(async () => {
  // These tests create and delete records. Never point them at a hosted database.
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL ?? process.env.NETLIFY_DATABASE_URL ?? ''
  if (url && !/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('Integration tests only run against a local database. Unset DATABASE_URL/NETLIFY_DB_URL.')
  }

  const healthy = await query<{ ok: number }>('select 1 as ok')
  expect(healthy.rows[0].ok).toBe(1)

  const superRow = await query<Record<string, unknown>>("select * from users where email = 'superadmin@yego.ng'")
  const contentRow = await query<Record<string, unknown>>("select * from users where email = 'content@yego.ng'")
  const nationalRow = await query<Record<string, unknown>>("select * from users where email = 'command@yego.ng'")
  if (!superRow.rows[0] || !contentRow.rows[0] || !nationalRow.rows[0]) {
    throw new Error('Seed accounts are missing. Run `pnpm db:seed:reset` before integration tests.')
  }
  superadmin = mapAuthUser(superRow.rows[0])
  contentAdmin = mapAuthUser(contentRow.rows[0])
  nationalAdmin = mapAuthUser(nationalRow.rows[0])
})

afterAll(async () => {
  if (createdContent.length) {
    await query('delete from notifications where entity_id = any($1::text[])', [createdContent])
    await query('delete from outbound_messages where related_id = any($1::text[])', [createdContent])
    await query('delete from audit_log where entity_id = any($1::text[])', [createdContent])
    await query('delete from content_items where id = any($1::uuid[])', [createdContent])
  }
  if (createdUsers.length) {
    await query('delete from sessions where user_id = any($1::uuid[])', [createdUsers])
    await query('delete from audit_log where actor_user_id = any($1::uuid[])', [createdUsers])
    await query('delete from users where id = any($1::uuid[])', [createdUsers])
  }
  if (createdApplications.length) {
    await query('delete from notifications where entity_id = any($1::text[])', [createdApplications])
    await query('delete from audit_log where entity_id = any($1::text[])', [createdApplications])
    await query('delete from applications where public_id = any($1::text[])', [createdApplications])
  }
  await query("delete from users where application_id is null and email like 'guard-cms-%@yego.local'")
})

async function trackContent(id: string): Promise<string> {
  createdContent.push(id)
  return id
}

describe('CMS permissions', () => {
  it('lets the Content Administrator create, publish and manage content directly', async () => {
    const draft = await createContent(contentAdmin, contentInput())
    await trackContent(draft.id)
    expect(draft.status).toBe('draft')

    const published = await publishContent(contentAdmin, { id: draft.id, notifyInApp: false, notifyEmail: false })
    expect(published.status).toBe('published')
    expect(published.publishedByLabel).toContain('Content Desk')

    const updated = await updateContent(contentAdmin, draft.id, contentInput({ title: `Edited ${draft.title}`, publish: true }))
    expect(updated.status).toBe('published')

    const unpublished = await unpublishContent(contentAdmin, draft.id)
    expect(unpublished.status).toBe('draft')

    const archived = await archiveContent(contentAdmin, draft.id)
    expect(archived.status).toBe('archived')

    const deleted = await deleteContent(contentAdmin, draft.id)
    expect(deleted.deletedAt).toBeTruthy()
    const restored = await restoreContent(contentAdmin, draft.id)
    expect(restored.deletedAt).toBeUndefined()

    // The audit trail records every step.
    const auditRows = await query<{ action: string }>(
      'select action from audit_log where entity_id = $1 and actor_user_id = $2 order by id',
      [draft.id, contentAdmin.id],
    )
    const actions = auditRows.rows.map((row) => row.action)
    expect(actions).toContain('content.created')
    expect(actions).toContain('content.published')
    expect(actions).toContain('content.unpublished')
    expect(actions).toContain('content.archived')
    expect(actions).toContain('content.deleted')
    expect(actions).toContain('content.restored')
  })

  it('lets the Super Administrator manage any content regardless of author', async () => {
    const item = await createContent(contentAdmin, contentInput({ audience: 'guards' }))
    await trackContent(item.id)
    // Publish + edit someone else's item, then take it down.
    const published = await publishContent(superadmin, { id: item.id, notifyInApp: false, notifyEmail: false })
    expect(published.status).toBe('published')
    const edited = await updateContent(
      superadmin,
      item.id,
      contentInput({ title: `${item.title} (edited by Super Admin)`, audience: 'guards', publish: true }),
    )
    expect(edited.updatedByLabel).toContain('ICT Super Admin')
    await unpublishContent(superadmin, item.id)
    await archiveContent(superadmin, item.id)
  })

  it('blocks the Content Administrator from people-data and role administration', async () => {
    await expect(listCommandUsers(contentAdmin)).rejects.toThrow(/cannot perform this action|cannot/)
    await expect(
      createContent(contentAdmin, contentInput({ videoUrl: 'javascript:alert(1)' })),
    ).rejects.toThrow()
  })

  it('blocks guards and unprivileged command roles from the CMS', async () => {
    const { user: guard } = await makeVerifiedApplicant()
    await expect(createContent(guard, contentInput())).rejects.toThrow(/cannot perform this action/)
    await expect(listContent(guard, { status: 'all', page: 1 })).rejects.toThrow(/cannot perform this action/)
  })

  it('rejects unsafe URLs at creation time', async () => {
    await expect(
      createContent(contentAdmin, contentInput({ resourceUrl: 'javascript:alert(document.cookie)' })),
    ).rejects.toThrow(/http\(s\)/)
    await expect(
      createContent(contentAdmin, contentInput({ videoUrl: 'data:text/html,evil' })),
    ).rejects.toThrow()
  })
})

describe('content visibility', () => {
  it('keeps drafts out of the public listing and slug lookup', async () => {
    const draft = await createContent(contentAdmin, contentInput({ title: `Draft Only ${stamp}` }))
    await trackContent(draft.id)

    const publicBefore = await listPublicContent({ page: 1 })
    expect(publicBefore.rows.find((row) => row.id === draft.id)).toBeUndefined()
    await expect(getPublicContentBySlug(draft.slug)).rejects.toThrow()

    const cmsList = await listContent(contentAdmin, { status: 'draft', page: 1 })
    expect(cmsList.rows.find((row) => row.id === draft.id)).toBeTruthy()
    expect(cmsList.stats.draft).toBeGreaterThan(0)
  })

  it('publishes public content to the News listing and article lookup', async () => {
    const item = await createContent(contentAdmin, contentInput({ title: `Visible Public Story ${stamp}` }))
    await trackContent(item.id)
    await publishContent(contentAdmin, { id: item.id, notifyInApp: false, notifyEmail: false })

    const publicList = await listPublicContent({ page: 1 })
    const found = publicList.rows.find((row) => row.id === item.id)
    expect(found).toBeTruthy()
    expect(found?.summary).toBe('Integration test summary')
    // Teasers never leak the body or recipient metadata.
    expect((found as unknown as Record<string, unknown>).body).toBeUndefined()

    const article = await getPublicContentBySlug(item.slug)
    expect(article.id).toBe(item.id)
    expect(article.body).toContain('**bold**')
  })

  it('removes unpublished and archived content from ordinary listings', async () => {
    const item = await createContent(contentAdmin, contentInput({ title: `Retired Story ${stamp}` }))
    await trackContent(item.id)
    await publishContent(contentAdmin, { id: item.id, notifyInApp: false, notifyEmail: false })
    expect((await listPublicContent({ page: 1 })).rows.find((row) => row.id === item.id)).toBeTruthy()

    await unpublishContent(contentAdmin, item.id)
    expect((await listPublicContent({ page: 1 })).rows.find((row) => row.id === item.id)).toBeUndefined()
    await expect(getPublicContentBySlug(item.slug)).rejects.toThrow()

    await publishContent(contentAdmin, { id: item.id, notifyInApp: false, notifyEmail: false })
    await archiveContent(contentAdmin, item.id)
    expect((await listPublicContent({ page: 1 })).rows.find((row) => row.id === item.id)).toBeUndefined()
  })

  it('never exposes restricted audiences on the public site', async () => {
    for (const audience of ['guards', 'applicants', 'all'] as ContentAudience[]) {
      const item = await createContent(contentAdmin, contentInput({ title: `Restricted ${audience} ${stamp}`, audience }))
      await trackContent(item.id)
      await publishContent(contentAdmin, { id: item.id, notifyInApp: false, notifyEmail: false })
      const publicList = await listPublicContent({ page: 1 })
      expect(publicList.rows.find((row) => row.id === item.id), audience).toBeUndefined()
      await expect(getPublicContentBySlug(item.slug), audience).rejects.toThrow()
    }
  })

  it('keeps slugs unique even after soft deletion', async () => {
    const first = await createContent(contentAdmin, contentInput({ title: `Slug Collision Test ${stamp}`, slug: `slug-test-${stamp}` }))
    await trackContent(first.id)
    await deleteContent(contentAdmin, first.id)
    const second = await createContent(contentAdmin, contentInput({ title: `Slug Collision Test ${stamp}`, slug: `slug-test-${stamp}` }))
    await trackContent(second.id)
    expect(second.slug).not.toBe(first.slug)
    const restored = await restoreContent(contentAdmin, first.id)
    expect(restored.deletedAt).toBeUndefined()
  })

  it('enforces portal audiences by account status', async () => {
    const guardOnly = await createContent(contentAdmin, contentInput({ title: `Guards Only Bulletin ${stamp}`, audience: 'guards' }))
    await trackContent(guardOnly.id)
    await publishContent(contentAdmin, { id: guardOnly.id, notifyInApp: false, notifyEmail: false })

    const applicantOnly = await createContent(contentAdmin, contentInput({ title: `Applicants Only Notice ${stamp}`, audience: 'applicants' }))
    await trackContent(applicantOnly.id)
    await publishContent(contentAdmin, { id: applicantOnly.id, notifyInApp: false, notifyEmail: false })

    const everyone = await createContent(contentAdmin, contentInput({ title: `Portal Wide Update ${stamp}`, audience: 'all' }))
    await trackContent(everyone.id)
    await publishContent(contentAdmin, { id: everyone.id, notifyInApp: false, notifyEmail: false })

    const publicStory = await createContent(contentAdmin, contentInput({ title: `Public Portal Story ${stamp}`, audience: 'public' }))
    await trackContent(publicStory.id)
    await publishContent(contentAdmin, { id: publicStory.id, notifyInApp: false, notifyEmail: false })

    const { user: guard } = await makeCertifiedGuard()
    const guardFeed = await listPortalContent(guard)
    const guardIds = guardFeed.map((row) => row.id)
    expect(guardIds).toContain(guardOnly.id)
    expect(guardIds).toContain(everyone.id)
    expect(guardIds).toContain(publicStory.id)
    expect(guardIds).not.toContain(applicantOnly.id)

    const { user: applicant } = await makeVerifiedApplicant()
    const applicantFeed = await listPortalContent(applicant)
    const applicantIds = applicantFeed.map((row) => row.id)
    expect(applicantIds).toContain(applicantOnly.id)
    expect(applicantIds).toContain(everyone.id)
    expect(applicantIds).toContain(publicStory.id)
    expect(applicantIds).not.toContain(guardOnly.id)

    // Command users have no portal feed.
    expect(await listPortalContent(contentAdmin)).toEqual([])
  })
})

describe('content notifications', () => {
  it('notifies exactly the selected in-app audience, once', async () => {
    const { user: guard } = await makeCertifiedGuard()
    const { user: applicant } = await makeVerifiedApplicant()

    const item = await createContent(contentAdmin, contentInput({ title: `Guard Notification Drill ${stamp}`, audience: 'guards' }))
    await trackContent(item.id)
    await publishContent(contentAdmin, { id: item.id, notifyInApp: true, notifyEmail: false })

    const guardRows = await query<{ id: string }>(
      'select id from notifications where user_id = $1 and entity_id = $2 and kind = $3',
      [guard.id, item.id, 'content'],
    )
    expect(guardRows.rows).toHaveLength(1)

    const applicantRows = await query<{ id: string }>(
      'select id from notifications where user_id = $1 and entity_id = $2 and kind = $3',
      [applicant.id, item.id, 'content'],
    )
    expect(applicantRows.rows).toHaveLength(0)

    // Publishing again must not duplicate the fan-out.
    await archiveContent(contentAdmin, item.id)
    await publishContent(contentAdmin, { id: item.id, notifyInApp: true, notifyEmail: false })
    const after = await query<{ n: number }>(
      'select count(*)::int as n from notifications where user_id = $1 and entity_id = $2 and kind = $3',
      [guard.id, item.id, 'content'],
    )
    expect(after.rows[0].n).toBe(1)
  })

  it('queues emails only for verified recipients and never blocks publication', async () => {
    const { user: guard } = await makeCertifiedGuard()
    const { user: applicant } = await makeVerifiedApplicant()
    // An unverified applicant email must never receive mail.
    const unverifiedApplication = await makeApplication()
    const unverified = await makeGuardUser(unverifiedApplication.uuid)

    const appEmail = await query<{ email: string }>('select email from applications where id = (select application_id from users where id = $1)', [guard.id])

    const item = await createContent(contentAdmin, contentInput({ title: `Email Notification Drill ${stamp}`, audience: 'guards' }))
    await trackContent(item.id)
    await publishContent(contentAdmin, { id: item.id, notifyInApp: false, notifyEmail: true })

    // Publication must stand even though no Resend provider is configured here.
    const stored = await getContent(contentAdmin, item.id)
    expect(stored.status).toBe('published')

    const rows = await query<{ to_email: string; status: string; related_type: string | null; template: string }>(
      'select to_email, status, related_type, template from outbound_messages where related_id = $1 and channel = $2',
      [item.id, 'email'],
    )
    expect(rows.rows.length).toBeGreaterThan(0)
    for (const row of rows.rows) {
      expect(row.related_type).toBe('content')
      expect(row.template).toBe('content.published')
      expect(row.to_email).not.toContain('@yego.local')
      // No provider configured in tests → truthfully skipped, never 'sent'.
      expect(row.status).toBe('skipped')
    }
    expect(rows.rows.find((row) => row.to_email === appEmail.rows[0].email)).toBeTruthy()
    const unverifiedEmail = await query<{ email: string }>(
      'select email from applications where id = (select application_id from users where id = $1)',
      [unverified.id],
    )
    expect(rows.rows.find((row) => row.to_email === unverifiedEmail.rows[0]?.email)).toBeUndefined()
    void applicant
  })

  it('records notification fan-out in the audit log with counts', async () => {
    const item = await createContent(contentAdmin, contentInput({ title: `Audit Notification ${stamp}`, audience: 'all' }))
    await trackContent(item.id)
    await publishContent(contentAdmin, { id: item.id, notifyInApp: true, notifyEmail: false })
    const rows = await query<{ detail: Record<string, unknown> }>(
      "select detail from audit_log where action = 'content.notification_initiated' and entity_id = $1",
      [item.id],
    )
    expect(rows.rows.length).toBeGreaterThan(0)
    expect(rows.rows[0].detail).toHaveProperty('inApp')
  })

  it('does not notify when the administrator publishes without the option', async () => {
    const { user: guard } = await makeCertifiedGuard()
    const item = await createContent(contentAdmin, contentInput({ title: `Silent Publication ${stamp}`, audience: 'guards' }))
    await trackContent(item.id)
    await publishContent(contentAdmin, { id: item.id, notifyInApp: false, notifyEmail: false })
    const rows = await query<{ n: number }>(
      'select count(*)::int as n from notifications where user_id = $1 and entity_id = $2',
      [guard.id, item.id],
    )
    expect(rows.rows[0].n).toBe(0)
    const stored = await getContent(contentAdmin, item.id)
    expect(stored.notificationSentAt).toBeUndefined()
  })
})

describe('existing workflows regression (CMS coexistence)', () => {
  it('still allows the Super Administrator to administer roles alongside the CMS', async () => {
    const users = await listCommandUsers(superadmin)
    expect(users.length).toBeGreaterThan(0)
  })

  it('still allows the application workflow end to end', async () => {
    const application = await makeApplication()
    await setApplicationStatus(nationalAdmin, {
      applicationId: application.publicId,
      status: 'Under Review',
      note: 'CMS coexistence check',
    })
    const row = await query<{ status: string }>('select status from applications where id = $1', [application.uuid])
    expect(row.rows[0].status).toBe('Under Review')
  })
})
