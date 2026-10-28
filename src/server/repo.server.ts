import type { PoolClient } from 'pg'
import type { Application } from '@/lib/fixtures'
import {
  notifyConfig,
  queueAndDeliver,
  queueAndDeliverEmail,
  renderApplicationConfirmationEmail,
  renderTemplate,
} from './notify.server'

import {
  AGENCIES,
  APPLICATION_STAGES,
  TRAINING_MODULES,
  type ApplicationStatus,
  type IncidentStatus,
} from '@/lib/fixtures'
import { can } from '@/lib/permissions'
import { STATES } from '@/lib/nigeria'
import { audit, mapAuthUser, requireCapability, sessionDto } from './auth.server'
import { one, query, transaction } from './db.server'
import {
  groupBy,
  mapAnnouncement,
  mapApplication,
  mapIncident,
  mapNotification,
  mapWarning,
  type AnnouncementRow,
  type ApplicationRow,
  type HistoryRow,
  type IncidentRow,
  type WarningRow,
} from './dto.server'
import { AppError, encryptNin, hashPassword, normalizePhone, randomToken, sha256 } from './security.server'
import { canAccessLga, canAccessState, scopeClause, zoneStates, type AuthUser } from './scope.server'

export interface BootstrapData {
  session: ReturnType<typeof sessionDto> | null
  applications: ReturnType<typeof mapApplication>[]
  incidents: ReturnType<typeof mapIncident>[]
  warnings: ReturnType<typeof mapWarning>[]
  announcements: ReturnType<typeof mapAnnouncement>[]
  notifications: ReturnType<typeof mapNotification>[]
  lastCheckInAt?: string
  /** Guard-only: the applicant must choose a real password before the portal unlocks. */
  mustChangePassword?: boolean
  /** Guard-only: the application's email address has been verified. */
  emailVerified?: boolean
  ready: true
}

const EMPTY: BootstrapData = {
  session: null,
  applications: [],
  incidents: [],
  warnings: [],
  announcements: [],
  notifications: [],
  ready: true,
}

function scopeParams(user: AuthUser, stateColumn: string, lgaColumn: string) {
  return scopeClause(user, stateColumn, lgaColumn, 1)
}

export async function bootstrap(user: AuthUser | null): Promise<BootstrapData> {
  if (!user) return EMPTY

  const isGuardUser = user.kind === 'guard'
  const masked = !isGuardUser && !can(user.role, 'screen:applicants')

  let applicationSql = 'select * from applications'
  let applicationParams: unknown[] = []
  if (isGuardUser) {
    applicationSql += ' where id = $1'
    applicationParams = [user.application_id]
  } else if (!can(user.role, 'view:analytics')) {
    applicationSql += ' where false'
  } else {
    const scope = scopeParams(user, 'state_of_residence', 'lga')
    if (scope.sql !== 'true') {
      applicationSql += ` where ${scope.sql}`
      applicationParams = scope.params
    }
  }
  applicationSql += ' order by submitted_at desc limit 500'

  const applications = (await query<ApplicationRow>(applicationSql, applicationParams)).rows
  const applicationIds = applications.map((row) => row.id)
  const applicationHistory = applicationIds.length
    ? (
        await query<HistoryRow>(
          `select * from application_history where application_id = any($1::uuid[]) order by created_at`,
          [applicationIds],
        )
      ).rows
    : []
  const historyByApplication = groupBy(applicationHistory, (row) => row.application_id ?? null)

  let incidentSql = 'select * from incidents'
  let incidentParams: unknown[] = []
  if (isGuardUser) {
    incidentSql += ' where reporter_user_id = $1'
    incidentParams = [user.id]
  } else if (!can(user.role, 'view:incidents')) {
    incidentSql += ' where false'
  } else {
    const scope = scopeParams(user, 'state', 'lga')
    if (scope.sql !== 'true') {
      incidentSql += ` where ${scope.sql}`
      incidentParams = scope.params
    }
  }
  incidentSql += ' order by reported_at desc limit 500'

  const incidents = (await query<IncidentRow>(incidentSql, incidentParams)).rows
  const incidentIds = incidents.map((row) => row.id)

  const evidence = incidentIds.length
    ? (
        await query<{ incident_id: string; kind: 'photo' | 'video' | 'document'; file_name: string }>(
          'select incident_id, kind, file_name from incident_evidence where incident_id = any($1::uuid[])',
          [incidentIds],
        )
      ).rows
    : []
  const evidenceByIncident = groupBy(evidence, (row) => row.incident_id)

  const incidentHistory = incidentIds.length
    ? (
        await query<HistoryRow>(
          `select * from incident_history where incident_id = any($1::uuid[]) order by created_at`,
          [incidentIds],
        )
      ).rows
    : []
  const historyByIncident = groupBy(incidentHistory, (row) => row.incident_id ?? null)

  const referrals = incidentIds.length
    ? (
        await query<{ incident_id: string; agency_code: string; created_at: Date; actor_name: string | null }>(
          `select r.incident_id, r.agency_code, r.created_at, u.name as actor_name
           from incident_referrals r left join users u on u.id = r.created_by
           where r.incident_id = any($1::uuid[]) order by r.created_at`,
          [incidentIds],
        )
      ).rows
    : []
  const referralsByIncident = groupBy(referrals, (row) => row.incident_id)

  let warningSql = 'select * from early_warnings'
  let warningParams: unknown[] = []
  if (isGuardUser) {
    warningSql += " where state = $1 and access = 'All Guards in area'"
    warningParams = [user.scope_state]
  } else if (!can(user.role, 'view:early-warning')) {
    warningSql += ' where false'
  } else {
    const scope = scopeParams(user, 'state', 'lga')
    if (scope.sql !== 'true') {
      warningSql += ` where ${scope.sql}`
      warningParams = scope.params
    }
  }
  warningSql += ' order by created_at desc limit 200'

  const warnings = (await query<WarningRow>(warningSql, warningParams)).rows
  const announcements = (await query<AnnouncementRow>('select * from announcements order by created_at desc limit 200')).rows
  const notifications = (
    await query<{
      id: string
      kind: string
      title: string
      body: string
      entity_type: string | null
      entity_id: string | null
      read_at: Date | null
      created_at: Date
    }>('select * from notifications where user_id = $1 order by created_at desc limit 50', [user.id])
  ).rows

  const guardPublicId = isGuardUser ? applications[0]?.public_id : undefined
  let lastCheckInAt: string | undefined
  if (isGuardUser && applications[0]) {
    const last = await one<{ checked_in_at: Date }>(
      'select max(checked_in_at) as checked_in_at from check_ins where application_id = $1',
      [applications[0].id],
    )
    if (last?.checked_in_at) lastCheckInAt = last.checked_in_at.toISOString()
  }
  let assessmentScore: number | undefined
  if (isGuardUser && applications[0]) {
    const scores = await query<{ score: number }>(
      'select max(score)::int as score from training_attempts where application_id = $1 group by module_id',
      [applications[0].id],
    )
    if (scores.rows.length) {
      assessmentScore = Math.round(scores.rows.reduce((sum, row) => sum + Number(row.score), 0) / scores.rows.length)
    }
  }

  return {
    session: sessionDto(user, guardPublicId),
    lastCheckInAt,
    mustChangePassword: isGuardUser ? user.must_change_password === true : undefined,
    emailVerified: isGuardUser ? applications[0]?.email_verified_at != null : undefined,
    applications: applications.map((row) =>
      mapApplication(row, {
        history: historyByApplication.get(row.id) ?? [],
        maskSensitive: masked,
        assessmentScore: isGuardUser && row.id === applications[0]?.id ? assessmentScore : undefined,
      }),
    ),
    incidents: incidents.map((row) =>
      mapIncident(row, {
        evidence: (evidenceByIncident.get(row.id) ?? []).map((item) => ({ kind: item.kind, name: item.file_name })),
        history: historyByIncident.get(row.id) ?? [],
        referrals: (referralsByIncident.get(row.id) ?? []).map((item) => ({
          agency: item.agency_code,
          at: item.created_at.toISOString(),
          by: item.actor_name ?? 'System',
        })),
      }),
    ),
    warnings: warnings.map(mapWarning),
    announcements: announcements.map(mapAnnouncement),
    notifications: notifications.map(mapNotification),
    ready: true,
  }
}

async function nextRef(client: PoolClient, sequence: string, prefix: (value: string) => string, width: number) {
  const result = await client.query<{ n: string }>(`select nextval('${sequence}')::text as n`)
  return prefix(result.rows[0].n.padStart(width, '0'))
}

export async function createApplication(
  input: Record<string, unknown>,
): Promise<{ application: Application; emailConfigured: boolean }> {
  let verificationToken = ''
  const created = await transaction(async (client) => {
    const publicId = await nextRef(client, 'application_ref_seq', (n) => `YG-APP-${n.slice(-6)}`, 6)
    const email = String(input.email).trim()
    const phone = normalizePhone(String(input.phone))
    const whatsapp = normalizePhone(String(input.whatsapp))
    const nin = String(input.nin)
    const photo = String(input.photo)

    const inserted = await client.query<ApplicationRow>(
      `insert into applications
        (public_id, full_name, gender, date_of_birth, phone, whatsapp, email,
         nin_ciphertext, nin_last4, state_of_origin, state_of_residence, lga, ward,
         preferred_polling_unit, polling_unit, background, experience, photo_data)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       returning *`,
      [
        publicId,
        String(input.fullName).trim(),
        input.gender,
        input.dateOfBirth,
        phone,
        whatsapp,
        email,
        encryptNin(nin),
        nin.slice(-4),
        input.stateOfOrigin,
        input.stateOfResidence,
        input.lga,
        String(input.ward).trim(),
        String(input.pollingUnit ?? '').trim() || null,
        String(input.pollingUnit ?? '').trim() || 'To be assigned',
        input.background,
        String(input.experience ?? '').trim(),
        photo,
      ],
    )
    const app = inserted.rows[0]

    // One-time email verification token; only its hash is stored.
    verificationToken = randomToken(24)
    await client.query(
      `update applications set email_verification_token_hash = $2, email_verification_expires_at = now() + interval '72 hours'
       where id = $1`,
      [app.id, sha256(verificationToken)],
    )

    await client.query(
      `insert into application_history (application_id, action, to_status, actor_label)
       values ($1,'Application Submitted','Application Submitted','Applicant')`,
      [app.id],
    )
    for (const kind of ['non_partisanship', 'code_of_conduct', 'data_use']) {
      await client.query(
        `insert into consent_records (application_id, kind, version) values ($1,$2,'2026-10')`,
        [app.id, kind],
      )
    }

    return app
  })

  await audit(null, 'application.submitted', 'application', created.public_id)
  void queueAndDeliver({
    toPhone: created.whatsapp || created.phone,
    template: 'application.received',
    body: renderTemplate('application.received', { applicationId: created.public_id }),
    relatedType: 'application',
    relatedId: created.public_id,
  }).catch(() => {})
  // Confirmation + verification email, sent exactly once, only after the
  // application has been saved (the caller's transaction has committed).
  const emailConfigured = notifyConfig().email != null
  const siteOrigin = process.env.SITE_URL?.trim() || 'https://yego.ng'
  const email = renderApplicationConfirmationEmail({
    fullName: created.full_name,
    applicationId: created.public_id,
    phone: created.phone,
    verifyUrl: `${siteOrigin}/verify-email?token=${verificationToken}`,
    loginUrl: `${siteOrigin}/login`,
    statusUrl: `${siteOrigin}/status`,
    siteUrl: siteOrigin,
  })
  void queueAndDeliverEmail({
    toEmail: created.email,
    subject: email.subject,
    body: email.text,
    html: email.html,
    relatedType: 'application',
    relatedId: created.public_id,
  }).catch(() => {})
  return { application: await loadApplication(created.public_id), emailConfigured }
}

/**
 * Queue a fresh verification email for an applicant whose link expired or
 * never arrived. Requires the Application ID plus the email on record, so a
 * stranger cannot trigger mails to arbitrary addresses; the mail always goes
 * to the address stored on the application.
 */
export async function resendVerificationEmail(applicationId: string, email: string, ip: string | null) {
  const publicId = applicationId.trim().toUpperCase()
  const trimmedEmail = email.trim().toLowerCase()

  const failures = await one<{ n: number }>(
    `select count(*)::int as n from audit_log
     where action = 'application.verification.resend.failed'
       and ($1::text is null or ip = $1)
       and created_at > now() - interval '15 minutes'`,
    [ip],
  )
  if ((failures?.n ?? 0) >= 10) {
    throw new AppError('Too many resend requests. Try again in 15 minutes.', 429)
  }

  const app = await one<ApplicationRow>(
    'select * from applications where upper(public_id) = $1 and lower(email) = $2',
    [publicId, trimmedEmail],
  )
  if (!app) {
    await query(
      `insert into audit_log (actor_label, action, entity_type, entity_id, outcome, ip)
       values ('Applicant','application.verification.resend.failed','application',$1,'failure',$2)`,
      [publicId, ip],
    )
    throw new AppError('No application matches that Application ID and email address.', 404)
  }
  if (app.email_verified_at) {
    return { verified: true, sent: false }
  }

  // A fresh single-use token replaces any previous one: the old link stops
  // working the moment the new mail leaves.
  const token = randomToken(24)
  await query(
    `update applications set email_verification_token_hash = $2,
       email_verification_expires_at = now() + interval '72 hours'
     where id = $1`,
    [app.id, sha256(token)],
  )
  await audit(null, 'application.verification.resent', 'application', app.public_id)

  const siteOrigin = process.env.SITE_URL?.trim() || 'https://yego.ng'
  const mail = renderApplicationConfirmationEmail({
    fullName: app.full_name,
    applicationId: app.public_id,
    phone: app.phone,
    verifyUrl: `${siteOrigin}/verify-email?token=${token}`,
    loginUrl: `${siteOrigin}/login`,
    statusUrl: `${siteOrigin}/status`,
    siteUrl: siteOrigin,
  })
  const configured = notifyConfig().email != null
  void queueAndDeliverEmail({
    toEmail: app.email,
    subject: mail.subject,
    body: mail.text,
    html: mail.html,
    relatedType: 'application',
    relatedId: app.public_id,
  }).catch(() => {})
  if (!configured) {
    throw new AppError(
      'Your application is safe, but the verification email could not be sent just now because the email service is not configured. Please try again later or contact the YEGO desk.',
      503,
    )
  }
  return { verified: false, sent: true }
}

/** Confirm an applicant's email address with the token from the verification link. */
export async function verifyEmailByToken(token: string) {
  const trimmed = token.trim()
  if (trimmed.length < 20 || trimmed.length > 120) {
    throw new AppError('This verification link is not valid.', 400)
  }
  const hash = sha256(trimmed)
  const app = await one<{
    public_id: string
    full_name: string
    email_verified_at: Date | null
    email_verification_expires_at: Date | null
  }>(
    `select public_id, full_name, email_verified_at, email_verification_expires_at
     from applications where email_verification_token_hash = $1`,
    [hash],
  )
  if (!app) {
    throw new AppError('This verification link is not valid. Check the link in your email or contact the YEGO desk.', 404)
  }
  if (!app.email_verified_at && app.email_verification_expires_at && app.email_verification_expires_at.getTime() < Date.now()) {
    throw new AppError('This verification link has expired. Track your application at /status or contact the YEGO desk.', 410)
  }
  await query(
    `update applications
     set email_verified_at = coalesce(email_verified_at, now()),
         email_verification_token_hash = null,
         email_verification_expires_at = null
     where email_verification_token_hash = $1`,
    [hash],
  )
  if (!app.email_verified_at) {
    await audit(null, 'application.email_verified', 'application', app.public_id)
  }
  return {
    ok: true,
    applicationId: app.public_id,
    fullName: app.full_name,
    alreadyVerified: !!app.email_verified_at,
  }
}

export async function lookupApplication(applicationId: string, phone: string, ip: string | null) {
  const publicId = applicationId.trim().toUpperCase()
  const normalized = normalizePhone(phone)

  const failures = await one<{ n: number }>(
    `select count(*)::int as n from audit_log
     where action = 'application.lookup.failed'
       and ($1::text is null or ip = $1)
       and created_at > now() - interval '15 minutes'`,
    [ip],
  )
  if ((failures?.n ?? 0) >= 10) {
    throw new AppError('Too many status lookups. Try again in 15 minutes.', 429)
  }

  const app = await one<ApplicationRow>(
    'select * from applications where upper(public_id) = $1 and phone = $2',
    [publicId, normalized],
  )

  if (!app) {
    await query(
      `insert into audit_log (actor_label, action, entity_type, entity_id, outcome, ip)
       values ('Anonymous','application.lookup.failed','application',$1,'failure',$2)`,
      [publicId, ip],
    )
    throw new AppError('No application matches that ID and phone number. Check both and try again.', 404)
  }

  const history = (
    await query<HistoryRow>('select * from application_history where application_id = $1 order by created_at', [app.id])
  ).rows

  await query(
    `insert into audit_log (actor_label, action, entity_type, entity_id, outcome, ip)
     values ('Applicant','application.lookup','application',$1,'success',$2)`,
    [publicId, ip],
  )

  return mapApplication(app, { history, maskSensitive: true })
}

export async function confirmWhatsApp(applicationId: string, phone: string) {
  const publicId = applicationId.trim().toUpperCase()
  const normalized = normalizePhone(phone)
  const result = await query(
    `update applications set whatsapp_confirmed_at = coalesce(whatsapp_confirmed_at, now())
     where upper(public_id) = $1 and phone = $2 returning public_id`,
    [publicId, normalized],
  )
  if (!result.rowCount) throw new AppError('Application not found.', 404)
  await audit(null, 'application.whatsapp_confirmed', 'application', publicId)
  return { confirmed: true }
}

function canManageIncident(user: AuthUser, incident: IncidentRow): void {
  if (user.scope_kind === 'lga') {
    if (!canAccessLga(user, incident.state, incident.lga)) {
      throw new AppError('This incident is outside your assigned area.', 403)
    }
    return
  }
  if (!canAccessState(user, incident.state)) {
    throw new AppError('This incident is outside your assigned area.', 403)
  }
}

function adminSeesState(admin: Record<string, unknown>, state: string, lga: string): boolean {
  const user = mapAuthUser(admin)
  if (user.scope_kind === 'national') return true
  if (user.scope_kind === 'zone') return canAccessState(user, state)
  if (user.scope_kind === 'state') return user.scope_state === state
  if (user.scope_kind === 'lga') return user.scope_state === state && user.scope_lga === lga
  return false
}

const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  Reported: ['Received', 'Under Review', 'Verified', 'Unverified'],
  Received: ['Under Review', 'Verified', 'Unverified'],
  'Under Review': ['Verified', 'Unverified'],
  Verified: ['Referred/Actioned', 'Closed'],
  Unverified: ['Closed'],
  'Referred/Actioned': ['Closed'],
  Closed: [],
}

export async function submitIncident(user: AuthUser, input: Record<string, unknown>) {
  if (user.kind !== 'guard' || !user.application_id) {
    throw new AppError('Only a deployed YEGO Guard can submit an incident.', 403)
  }

  const created = await transaction(async (client) => {
    const appResult = await client.query<ApplicationRow>('select * from applications where id = $1', [user.application_id])
    const app = appResult.rows[0]
    if (!app) throw new AppError('Guard profile not found.', 404)
    if (app.status !== 'Certified/Active') {
      throw new AppError('Election-Day reporting unlocks after certification.', 403)
    }

    const publicId = await nextRef(client, 'incident_ref_seq', (n) => `INC-${new Date().getFullYear()}-${n.slice(-6)}`, 6)
    const inserted = await client.query<IncidentRow>(
      `insert into incidents
        (public_id, type, description, severity, state, lga, ward, polling_unit, lat, lng,
         occurred_at, reporter_name, reporter_id, reporter_user_id, status, category, election_day)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Reported',$15,$16)
       returning *`,
      [
        publicId,
        input.type,
        input.description,
        input.severity,
        app.state_of_residence,
        app.lga,
        app.ward,
        app.polling_unit,
        input.lat,
        input.lng,
        input.occurredAt,
        app.full_name,
        app.yego_id ?? app.public_id,
        user.id,
        input.category ?? null,
        Boolean(input.electionDay),
      ],
    )
    const incident = inserted.rows[0]

    const evidence = (input.evidence ?? []) as { kind: string; name: string }[]
    for (const item of evidence) {
      await client.query(
        `insert into incident_evidence (incident_id, kind, file_name, storage_key)
         values ($1,$2,$3,null)`,
        [incident.id, item.kind, item.name],
      )
    }

    await client.query(
      `insert into incident_history (incident_id, action, to_status, actor_label)
       values ($1,'Reported','Reported',$2)`,
      [incident.id, `${app.full_name} (YEGO Guard)`],
    )

    const admins = (await client.query<Record<string, unknown>>("select * from users where kind = 'command' and active = true")).rows
    for (const row of admins) {
      const role = String(row.role)
      if (!can(role, 'view:incidents') || !adminSeesState(row, incident.state, incident.lga)) continue
      await client.query(
        `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
         values ($1,'incident',$2,$3,'incident',$4)`,
        [
          row.id,
          `New ${String(input.severity).toLowerCase()} incident reported`,
          `${input.type} · ${app.polling_unit}, ${app.lga}, ${app.state_of_residence}`,
          publicId,
        ],
      )
    }

    return incident
  })

  await audit(user, 'incident.reported', 'incident', created.public_id, { severity: input.severity, type: input.type })
  return loadIncident(created.public_id)
}

export async function loadIncident(publicId: string) {
  const row = await one<IncidentRow>('select * from incidents where public_id = $1', [publicId])
  if (!row) throw new AppError('Incident not found.', 404)
  const evidence = (
    await query<{ kind: 'photo' | 'video' | 'document'; file_name: string }>(
      'select kind, file_name from incident_evidence where incident_id = $1',
      [row.id],
    )
  ).rows
  const history = (
    await query<HistoryRow>('select * from incident_history where incident_id = $1 order by created_at', [row.id])
  ).rows
  const referrals = (
    await query<{ agency_code: string; created_at: Date; actor_name: string | null }>(
      `select r.agency_code, r.created_at, u.name as actor_name
       from incident_referrals r left join users u on u.id = r.created_by
       where r.incident_id = $1 order by r.created_at`,
      [row.id],
    )
  ).rows
  return mapIncident(row, {
    evidence: evidence.map((item) => ({ kind: item.kind, name: item.file_name })),
    history,
    referrals: referrals.map((item) => ({ agency: item.agency_code, at: item.created_at.toISOString(), by: item.actor_name ?? 'System' })),
  })
}

export async function setIncidentStatus(
  user: AuthUser,
  input: { incidentId: string; status: IncidentStatus; note?: string; category?: string },
) {
  requireCapability(user, 'verify:incidents')
  const row = await one<IncidentRow>('select * from incidents where public_id = $1', [input.incidentId.toUpperCase()])
  if (!row) throw new AppError('Incident not found.', 404)
  canManageIncident(user, row)

  if (!INCIDENT_TRANSITIONS[row.status].includes(input.status)) {
    throw new AppError(`An incident cannot move from “${row.status}” to “${input.status}”.`, 409)
  }

  await transaction(async (client) => {
    await client.query('update incidents set status = $1, category = coalesce($2, category) where id = $3', [
      input.status,
      input.category ?? null,
      row.id,
    ])
    await client.query(
      `insert into incident_history (incident_id, action, from_status, to_status, note, actor_user_id, actor_label)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [row.id, input.status, row.status, input.status, input.note ?? null, user.id, `${user.name} (${user.role})`],
    )
    const reporter = await client.query<{ id: string }>('select id from users where application_id in (select id from applications where full_name = $1) limit 1', [row.reporter_name])
    if (reporter.rows[0]) {
      await client.query(
        `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
         values ($1,'incident_update','Incident update',$2,'incident',$3)`,
        [reporter.rows[0].id, `${row.public_id} is now “${input.status}”.`, row.public_id],
      )
    }
  })

  await audit(user, 'incident.status_changed', 'incident', row.public_id, { from: row.status, to: input.status })
  return loadIncident(row.public_id)
}

export async function addIncidentNote(
  user: AuthUser,
  input: { incidentId: string; action: string; note: string },
) {
  requireCapability(user, 'verify:incidents')
  const row = await one<IncidentRow>('select * from incidents where public_id = $1', [input.incidentId.toUpperCase()])
  if (!row) throw new AppError('Incident not found.', 404)
  canManageIncident(user, row)
  await query(
    `insert into incident_history (incident_id, action, note, actor_user_id, actor_label)
     values ($1,$2,$3,$4,$5)`,
    [row.id, input.action, input.note, user.id, `${user.name} (${user.role})`],
  )
  await audit(user, 'incident.note_added', 'incident', row.public_id, { action: input.action })
  return loadIncident(row.public_id)
}

export async function referIncident(
  user: AuthUser,
  input: { incidentId: string; agencies: string[]; note?: string },
) {
  requireCapability(user, 'refer:incidents')
  const row = await one<IncidentRow>('select * from incidents where public_id = $1', [input.incidentId.toUpperCase()])
  if (!row) throw new AppError('Incident not found.', 404)
  canManageIncident(user, row)
  if (!['Verified', 'Referred/Actioned'].includes(row.status)) {
    throw new AppError('Only verified incidents can be referred.', 409)
  }

  const chosen = AGENCIES.filter((agency) => input.agencies.includes(agency.code))
  if (!chosen.length) throw new AppError('Choose at least one agency.', 400)

  await transaction(async (client) => {
    for (const agency of chosen) {
      const referral = await client.query<{ id: string }>(
        `insert into incident_referrals (incident_id, agency_code, agency_name, note, status, created_by)
         values ($1,$2,$3,$4,'pending_manual',$5) returning id`,
        [row.id, agency.code, agency.name, input.note ?? null, user.id],
      )
      await client.query(
        `insert into referral_events (referral_id, event, detail, actor_user_id)
         values ($1,'created','Recorded for manual delivery; no external integration is configured.',$2)`,
        [referral.rows[0].id, user.id],
      )
    }
    if (row.status === 'Verified') {
      await client.query("update incidents set status = 'Referred/Actioned' where id = $1", [row.id])
      await client.query(
        `insert into incident_history (incident_id, action, from_status, to_status, note, actor_user_id, actor_label)
         values ($1,'Referred/Actioned',$2,'Referred/Actioned',$3,$4,$5)`,
        [row.id, row.status, input.note ?? `Referral recorded for ${chosen.map((a) => a.code).join(', ')}`, user.id, `${user.name} (${user.role})`],
      )
    }
  })

  await audit(user, 'incident.referred', 'incident', row.public_id, { agencies: chosen.map((a) => a.code) })
  return loadIncident(row.public_id)
}

export async function setApplicationStatus(
  user: AuthUser,
  input: { applicationId: string; status: ApplicationStatus; note?: string },
) {
  const row = await one<ApplicationRow>('select * from applications where public_id = $1', [input.applicationId.toUpperCase()])
  if (!row) throw new AppError('Application not found.', 404)
  if (!canAccessLga(user, row.state_of_residence, row.lga) && !canAccessState(user, row.state_of_residence)) {
    throw new AppError('This application is outside your assigned area.', 403)
  }

  const targetIndex = APPLICATION_STAGES.indexOf(input.status as (typeof APPLICATION_STAGES)[number])
  const needsApproval = input.status === 'Not Approved' || targetIndex >= APPLICATION_STAGES.indexOf('Approved')
  requireCapability(user, needsApproval ? 'approve:verification' : 'screen:applicants')

  if (row.status === 'Not Approved' || row.status === 'Certified/Active' || input.status === 'Not Approved') {
    if (row.status === input.status) return loadApplication(row.public_id)
    if (row.status === 'Not Approved') throw new AppError('A rejected application cannot be re-opened here.', 409)
    if (row.status === 'Certified/Active') throw new AppError('A certified Guard cannot be moved backwards.', 409)
  } else {
    const currentIndex = APPLICATION_STAGES.indexOf(row.status as (typeof APPLICATION_STAGES)[number])
    if (targetIndex !== currentIndex + 1) {
      throw new AppError(`An application cannot jump from “${row.status}” to “${input.status}”.`, 409)
    }
  }

  await transaction(async (client) => {
    if (input.status === 'Certified/Active') {
      if (row.training_progress < 100) {
        throw new AppError('Training must be completed before certification.', 409)
      }
      const stateCode = STATES.find((state) => state.name === row.state_of_residence)?.code ?? 'NG'
      const yegoId = row.yego_id ?? `YEGO/${stateCode}/${row.public_id.slice(-4)}`
      const certificate = await client.query<{ n: string }>("select nextval('certificate_ref_seq')::text as n")
      const certificateNo = `YEGO-CERT-${certificate.rows[0].n.padStart(4, '0')}`
      await client.query('update applications set status = $1, yego_id = coalesce(yego_id, $2) where id = $3', [
        input.status,
        yegoId,
        row.id,
      ])
      await client.query(
        `insert into certificates (application_id, certificate_no, issued_by) values ($1,$2,$3)
         on conflict (application_id) do nothing`,
        [row.id, certificateNo, user.id],
      )
    } else {
      await client.query('update applications set status = $1 where id = $2', [input.status, row.id])
    }

    await client.query(
      `insert into application_history (application_id, action, from_status, to_status, note, actor_user_id, actor_label)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [row.id, input.status, row.status, input.status, input.note ?? null, user.id, `${user.name} (${user.role})`],
    )

    const guard = await client.query<{ id: string }>('select id from users where application_id = $1', [row.id])
    if (guard.rows[0]) {
      await client.query(
        `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
         values ($1,'application_update','Application update',$2,'application',$3)`,
        [guard.rows[0].id, `Your application is now “${input.status}”.`, row.public_id],
      )
    }
  })

  await audit(user, 'application.status_changed', 'application', row.public_id, { from: row.status, to: input.status })
  void queueAndDeliver({
    toPhone: row.whatsapp || row.phone,
    template: 'application.status',
    body: renderTemplate('application.status', { applicationId: row.public_id, status: input.status, note: input.note }),
    relatedType: 'application',
    relatedId: row.public_id,
  }).catch(() => {})
  return loadApplication(row.public_id)
}

export async function assignPollingUnit(
  user: AuthUser,
  input: { applicationId: string; ward: string; pollingUnit: string },
) {
  requireCapability(user, 'assign:polling-units')
  const row = await one<ApplicationRow>('select * from applications where public_id = $1', [input.applicationId.toUpperCase()])
  if (!row) throw new AppError('Application not found.', 404)
  if (!canAccessLga(user, row.state_of_residence, row.lga)) {
    throw new AppError('This application is outside your assigned area.', 403)
  }
  await query('update applications set ward = $1, polling_unit = $2 where id = $3', [
    input.ward,
    input.pollingUnit,
    row.id,
  ])
  await query(
    `insert into application_history (application_id, action, note, actor_user_id, actor_label)
     values ($1,'Polling unit assigned',$2,$3,$4)`,
    [row.id, `${input.ward} · ${input.pollingUnit}`, user.id, `${user.name} (${user.role})`],
  )
  await audit(user, 'application.polling_unit_assigned', 'application', row.public_id, {
    ward: input.ward,
    pollingUnit: input.pollingUnit,
  })
  return loadApplication(row.public_id)
}

export async function loadApplication(publicId: string) {
  const row = await one<ApplicationRow>('select * from applications where public_id = $1', [publicId])
  if (!row) throw new AppError('Application not found.', 404)
  const history = (
    await query<HistoryRow>('select * from application_history where application_id = $1 order by created_at', [row.id])
  ).rows
  return mapApplication(row, { history })
}

export async function submitTrainingQuiz(
  user: AuthUser,
  input: { moduleId: string; answers: number[] },
) {
  if (user.kind !== 'guard' || !user.application_id) {
    throw new AppError('Only a YEGO Guard can take training assessments.', 403)
  }
  const module = TRAINING_MODULES.find((item) => item.id === input.moduleId)
  if (!module) throw new AppError('Training module not found.', 404)

  const app = await one<ApplicationRow>('select * from applications where id = $1', [user.application_id])
  if (!app) throw new AppError('Guard profile not found.', 404)

  const passedRows = await query<{ module_id: string }>(
    'select distinct module_id from training_attempts where application_id = $1 and passed = true',
    [app.id],
  )
  const passed = new Set(passedRows.rows.map((row) => row.module_id))
  const moduleIndex = TRAINING_MODULES.indexOf(module)
  if (moduleIndex > passed.size) {
    throw new AppError('Complete the earlier modules first.', 409)
  }

  const correct =
    input.answers.length === module.quiz.length && module.quiz.every((question, index) => question.answer === input.answers[index])

  await query(
    `insert into training_attempts (application_id, module_id, answers, score, passed)
     values ($1,$2,$3,$4,$5)`,
    [app.id, module.id, JSON.stringify(input.answers), correct ? 100 : 0, correct],
  )

  if (!correct) {
    return { passed: false, progress: app.training_progress, status: app.status }
  }

  passed.add(module.id)
  const progress = Math.round((passed.size / TRAINING_MODULES.length) * 100)
  const nextStatus: ApplicationStatus =
    passed.size >= TRAINING_MODULES.length ? 'Training Completed' : app.status === 'Certified/Active' ? app.status : 'Training Required'

  await query('update applications set training_progress = $1, status = $2 where id = $3', [progress, nextStatus, app.id])
  if (nextStatus === 'Training Completed' && app.status !== 'Training Completed') {
    await query(
      `insert into application_history (application_id, action, from_status, to_status, actor_user_id, actor_label)
       values ($1,'Training Completed',$2,'Training Completed',$3,$4)`,
      [app.id, app.status, user.id, `${user.name} (YEGO Guard)`],
    )
  }
  await audit(user, 'training.quiz_completed', 'application', app.public_id, { moduleId: module.id, progress })
  return { passed: true, progress, status: nextStatus }
}

export async function raiseWarning(
  user: AuthUser,
  input: { type: string; title: string; summary: string; evidenceCount: number },
) {
  if (user.kind !== 'guard' || !user.application_id) {
    throw new AppError('Only a YEGO Guard can raise an early warning.', 403)
  }
  const app = await one<ApplicationRow>('select * from applications where id = $1', [user.application_id])
  if (!app) throw new AppError('Guard profile not found.', 404)
  const state = STATES.find((item) => item.name === app.state_of_residence)

  const created = await transaction(async (client) => {
    const publicId = await nextRef(client, 'warning_ref_seq', (n) => `EW-${new Date().getFullYear()}-${n.slice(-4)}`, 4)
    const row = await client.query<{ id: string; public_id: string }>(
      `insert into early_warnings
        (public_id, type, title, summary, state, lga, level, access, raised_by_user_id, raised_by_label, evidence_count, lat, lng)
       values ($1,$2,$3,$4,$5,$6,'Watch','Command only',$7,$8,$9,$10,$11)
       returning id, public_id`,
      [
        publicId,
        input.type,
        input.title,
        input.summary,
        app.state_of_residence,
        app.lga,
        user.id,
        `Guard ${app.yego_id ?? app.public_id}`,
        input.evidenceCount,
        (state?.lat ?? 9) + (Math.random() - 0.5) * 0.1,
        (state?.lng ?? 8) + (Math.random() - 0.5) * 0.1,
      ],
    )

    const admins = (await client.query<Record<string, unknown>>("select * from users where kind = 'command' and active = true")).rows
    for (const admin of admins) {
      if (!can(String(admin.role), 'view:early-warning')) continue
      if (!adminSeesState(admin, app.state_of_residence, app.lga)) continue
      await client.query(
        `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
         values ($1,'warning',$2,$3,'warning',$4)`,
        [admin.id, `Early warning: ${input.title}`, `${app.lga}, ${app.state_of_residence}`, publicId],
      )
    }

    return row.rows[0]
  })

  await audit(user, 'warning.raised', 'warning', created.public_id, { type: input.type })
  return { id: created.public_id }
}

export async function postAnnouncement(
  user: AuthUser,
  input: { kind: string; title: string; body: string; audience?: string },
) {
  const canNational = can(user.role, 'send:national')
  const canState = can(user.role, 'send:state')
  if (!canNational && !canState) throw new AppError('Your role cannot send messages.', 403)

  let tier: 'National Command' | 'Regional/State' | 'LGA/Field'
  let fromLabel: string
  let audience: string

  if (canNational && user.scope_kind === 'national') {
    tier = 'National Command'
    fromLabel = 'National Command'
    audience = input.audience ?? 'All Guards'
  } else if (user.scope_kind === 'zone') {
    tier = 'Regional/State'
    fromLabel = `${user.scope_zone ?? 'Regional'} Coordination`
    audience = `${user.scope_zone ?? 'Zone'} Guards`
  } else if (user.scope_kind === 'state') {
    tier = 'Regional/State'
    fromLabel = `${user.scope_state ?? 'State'} State Coordination`
    audience = `${user.scope_state ?? 'State'} Guards`
  } else if (user.scope_kind === 'lga') {
    tier = 'LGA/Field'
    fromLabel = `${user.scope_lga ?? 'LGA'} LGA Desk`
    audience = `${user.scope_lga ?? 'LGA'} Guards`
  } else {
    throw new AppError('Your account has no messaging scope.', 403)
  }

  const inserted = await one<AnnouncementRow>(
    `insert into announcements (from_label, tier, kind, title, body, audience, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [fromLabel, tier, input.kind, input.title, input.body, audience, user.id],
  )
  if (!inserted) throw new AppError('Could not save the message.', 500)
  await audit(user, 'announcement.posted', 'announcement', inserted.id, { audience })
  return mapAnnouncement(inserted)
}

export async function getNotifications(user: AuthUser) {
  const rows = (
    await query<{
      id: string
      kind: string
      title: string
      body: string
      entity_type: string | null
      entity_id: string | null
      read_at: Date | null
      created_at: Date
    }>('select * from notifications where user_id = $1 order by created_at desc limit 50', [user.id])
  ).rows
  return rows.map(mapNotification)
}

export async function markNotificationsRead(user: AuthUser, ids: string[]) {
  if (!ids.length) return { updated: 0 }
  const result = await query(
    'update notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null',
    [user.id, ids],
  )
  return { updated: result.rowCount ?? 0 }
}

export async function checkIn(user: AuthUser, lat?: number, lng?: number) {
  if (user.kind !== 'guard' || !user.application_id) {
    throw new AppError('Only a YEGO Guard can check in.', 403)
  }
  const app = await one<ApplicationRow>('select * from applications where id = $1', [user.application_id])
  if (!app) throw new AppError('Guard profile not found.', 404)
  await query('insert into check_ins (application_id, polling_unit, lat, lng) values ($1,$2,$3,$4)', [
    app.id,
    app.polling_unit,
    lat ?? null,
    lng ?? null,
  ])
  await audit(user, 'guard.checked_in', 'application', app.public_id)
  return { checkedInAt: new Date().toISOString() }
}

export { EMPTY }

export async function listPollingUnits(state: string, lga: string, ward: string) {
  const stateRow = STATES.find((item) => item.name === state)
  if (!stateRow) return [] as { code: string; name: string; ward: string }[]

  const exact = await query<{ code: string; name: string; ward: string }>(
    `select code, name, ward from polling_units
     where state_code = $1 and lower(lga) = lower($2) and lower(ward) = lower($3)
     order by code limit 500`,
    [stateRow.code, lga, ward],
  )
  if (exact.rows.length) return exact.rows

  const fallback = await query<{ code: string; name: string; ward: string }>(
    `select code, name, ward from polling_units
     where state_code = $1 and lower(lga) = lower($2)
     order by ward, code limit 500`,
    [stateRow.code, lga],
  )
  return fallback.rows
}

/* Command reporting, applicant messaging and training administration -------- */

async function ensureApplicantUser(app: ApplicationRow): Promise<string> {
  const existing = await one<{ id: string }>('select id from users where application_id = $1', [app.id])
  if (existing) return existing.id

  const email = `guard-${app.public_id.toLowerCase()}@yego.local`
  try {
    const inserted = await query<{ id: string }>(
      `insert into users (email, password_hash, name, role, kind, scope_kind, scope_state, scope_lga, application_id)
       values ($1,$2,$3,'YEGO Guard','guard','self',$4,$5,$6) returning id`,
      [email, hashPassword(randomToken(24)), app.full_name, app.state_of_residence, app.lga, app.id],
    )
    return inserted.rows[0].id
  } catch {
    const fallback = await one<{ id: string }>('select id from users where application_id = $1', [app.id])
    if (fallback) return fallback.id
    throw new AppError('Could not create the applicant inbox.', 500)
  }
}

function assertTrainingScope(user: AuthUser, app: ApplicationRow): void {
  if (user.scope_kind === 'training' || user.scope_kind === 'national') return
  if (user.scope_kind === 'lga') {
    if (!canAccessLga(user, app.state_of_residence, app.lga)) {
      throw new AppError('This applicant is outside your assigned area.', 403)
    }
    return
  }
  if (!canAccessState(user, app.state_of_residence)) {
    throw new AppError('This applicant is outside your assigned area.', 403)
  }
}

export async function reportIncidentByCommand(
  user: AuthUser,
  input: {
    state: string
    lga: string
    ward: string
    pollingUnit?: string
    type: string
    severity: 'Low' | 'Medium' | 'High' | 'Critical'
    description: string
    occurredAt: string
    electionDay: boolean
  },
) {
  requireCapability(user, 'report:incidents')
  const state = STATES.find((item) => item.name === input.state)
  if (!state) throw new AppError('Select a valid state.', 400)
  if (!state.lgas.includes(input.lga)) throw new AppError('Select an LGA in the chosen state.', 400)
  if (!canAccessState(user, input.state)) throw new AppError('That state is outside your assigned area.', 403)
  if (user.scope_kind === 'lga' && !canAccessLga(user, input.state, input.lga)) {
    throw new AppError('That LGA is outside your assigned area.', 403)
  }

  const created = await transaction(async (client) => {
    const publicId = await nextRef(client, 'incident_ref_seq', (n) => `INC-${new Date().getFullYear()}-${n.slice(-6)}`, 6)
    const inserted = await client.query<IncidentRow>(
      `insert into incidents
        (public_id, type, description, severity, state, lga, ward, polling_unit, lat, lng,
         occurred_at, reporter_name, reporter_id, reporter_user_id, status, election_day)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Reported',$15)
       returning *`,
      [
        publicId,
        input.type,
        input.description,
        input.severity,
        input.state,
        input.lga,
        input.ward,
        input.pollingUnit || 'To be assigned',
        state.lat + (Math.random() - 0.5) * 0.16,
        state.lng + (Math.random() - 0.5) * 0.16,
        input.occurredAt,
        `${user.name} (${user.role})`,
        user.email,
        user.id,
        input.electionDay,
      ],
    )
    const incident = inserted.rows[0]

    await client.query(
      `insert into incident_history (incident_id, action, to_status, actor_user_id, actor_label)
       values ($1,'Reported','Reported',$2,$3)`,
      [incident.id, user.id, `${user.name} (${user.role})`],
    )

    const admins = (await client.query<Record<string, unknown>>("select * from users where kind = 'command' and active = true")).rows
    for (const admin of admins) {
      if (admin.id === user.id) continue
      if (!can(String(admin.role), 'view:incidents') || !adminSeesState(admin, input.state, input.lga)) continue
      await client.query(
        `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
         values ($1,'incident',$2,$3,'incident',$4)`,
        [
          admin.id,
          `New ${input.severity.toLowerCase()} incident reported`,
          `${input.type} · ${input.pollingUnit || 'PU to be assigned'}, ${input.lga}, ${input.state}`,
          publicId,
        ],
      )
    }

    return incident
  })

  await audit(user, 'incident.reported_by_command', 'incident', created.public_id, { severity: input.severity })
  return loadIncident(created.public_id)
}

export interface TrainingRosterRow {
  applicationId: string
  fullName: string
  state: string
  lga: string
  status: ApplicationStatus
  trainingProgress: number
  modulesPassed: number
  assessmentScore: number | null
  certification: 'Pending' | 'Eligible' | 'Issued'
  lastActivity: string | null
}

export async function getTrainingRoster(user: AuthUser): Promise<TrainingRosterRow[]> {
  requireCapability(user, 'manage:training')
  let sql = `select public_id, full_name, state_of_residence, lga, status, training_progress, updated_at
             from applications`
  let params: unknown[] = []
  if (user.scope_kind !== 'training' && user.scope_kind !== 'national') {
    const scope = scopeClause(user, 'state_of_residence', 'lga', 1)
    if (scope.sql !== 'true') {
      sql += ` where ${scope.sql}`
      params = scope.params
    }
  }
  sql += ' order by full_name limit 500'
  const rows = await query<{
    public_id: string
    full_name: string
    state_of_residence: string
    lga: string
    status: ApplicationStatus
    training_progress: number
    updated_at: Date
  }>(sql, params)

  const ids = rows.rows.map((row) => row.public_id)
  const scores = ids.length
    ? (
        await query<{ public_id: string; score: number; last_at: Date }>(
          `select a.public_id, round(avg(s.score))::int as score, max(s.last_at) as last_at
           from applications a
           join (
             select application_id, module_id, max(score) as score, max(created_at) as last_at
             from training_attempts group by application_id, module_id
           ) s on s.application_id = a.id
           where a.public_id = any($1::text[])
           group by a.public_id`,
          [ids],
        )
      ).rows
    : []
  const scoreByApp = new Map(scores.map((row) => [row.public_id, row]))
  const totalModules = TRAINING_MODULES.length

  return rows.rows.map((row) => {
    const score = scoreByApp.get(row.public_id)
    const certification: TrainingRosterRow['certification'] =
      row.status === 'Certified/Active' ? 'Issued' : row.training_progress >= 100 ? 'Eligible' : 'Pending'
    return {
      applicationId: row.public_id,
      fullName: row.full_name,
      state: row.state_of_residence,
      lga: row.lga,
      status: row.status,
      trainingProgress: row.training_progress,
      modulesPassed: Math.round((row.training_progress / 100) * totalModules),
      assessmentScore: score?.score ?? null,
      certification,
      lastActivity: score?.last_at ? score.last_at.toISOString() : row.updated_at.toISOString(),
    }
  })
}

export async function updateTrainingProgress(
  user: AuthUser,
  input: { applicationId: string; progress: number; note?: string },
) {
  requireCapability(user, 'manage:training')
  const app = await one<ApplicationRow>('select * from applications where public_id = $1', [input.applicationId.toUpperCase()])
  if (!app) throw new AppError('Application not found.', 404)
  assertTrainingScope(user, app)

  const progress = Math.max(0, Math.min(100, Math.round(input.progress)))
  let status = app.status
  if (app.status === 'Training Required' || app.status === 'Training Completed') {
    status = progress >= 100 ? 'Training Completed' : 'Training Required'
  }

  await query('update applications set training_progress = $1, status = $2 where id = $3', [progress, status, app.id])
  await query(
    `insert into application_history (application_id, action, note, actor_user_id, actor_label)
     values ($1,'Training progress updated',$2,$3,$4)`,
    [app.id, `${progress}% · ${input.note ?? 'Updated by the Training Officer'}`, user.id, `${user.name} (${user.role})`],
  )

  const applicantUserId = await ensureApplicantUser(app)
  await query(
    `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
     values ($1,'applicant_message','Training progress updated',$2,'application',$3)`,
    [
      applicantUserId,
      `Your training is now ${progress}%${progress >= 100 ? '. Training completed.' : '.'} ${input.note ?? ''}`.trim(),
      app.public_id,
    ],
  )
  await audit(user, 'training.progress_updated', 'application', app.public_id, { progress, status })
  return { progress, status }
}

export async function messageApplicant(
  user: AuthUser,
  input: { applicationId: string; title?: string; body: string },
) {
  const allowed =
    can(user.role, 'screen:applicants') ||
    can(user.role, 'approve:verification') ||
    can(user.role, 'manage:training')
  if (!allowed) throw new AppError('Your role cannot message applicants.', 403)

  const app = await one<ApplicationRow>('select * from applications where public_id = $1', [input.applicationId.toUpperCase()])
  if (!app) throw new AppError('Application not found.', 404)
  assertTrainingScope(user, app)

  const applicantUserId = await ensureApplicantUser(app)
  const title = input.title?.trim() || 'Message from YEGO'
  await query(
    `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
     values ($1,'applicant_message',$2,$3,'application',$4)`,
    [applicantUserId, title, input.body, app.public_id],
  )
  await query(
    `insert into application_history (application_id, action, note, actor_user_id, actor_label)
     values ($1,'Message sent to applicant',$2,$3,$4)`,
    [app.id, input.body, user.id, `${user.name} (${user.role})`],
  )
  await audit(user, 'application.message_sent', 'application', app.public_id)
  void queueAndDeliver({
    toPhone: app.whatsapp || app.phone,
    template: 'applicant.message',
    body: renderTemplate('applicant.message', { title, body: input.body }),
    relatedType: 'application',
    relatedId: app.public_id,
  }).catch(() => {})
  return { ok: true }
}

/* Early-warning board workflow --------------------------------------------- */

const WARNING_LEVELS = ['Watch', 'Alert', 'Urgent'] as const
const WARNING_ACCESS = ['Command only', 'State coordinators', 'All Guards in area'] as const
export type WarningLevel = (typeof WARNING_LEVELS)[number]
export type WarningAccess = (typeof WARNING_ACCESS)[number]

async function loadWarningRow(publicId: string) {
  const row = await one<WarningRow>('select * from early_warnings where public_id = $1', [publicId.toUpperCase()])
  if (!row) throw new AppError('Early warning not found.', 404)
  return row
}

function assertWarningScope(user: AuthUser, row: WarningRow): void {
  if (user.scope_kind === 'lga') {
    if (!canAccessLga(user, row.state, row.lga)) {
      throw new AppError('This warning is outside your assigned area.', 403)
    }
    return
  }
  if (!canAccessState(user, row.state)) {
    throw new AppError('This warning is outside your assigned area.', 403)
  }
}

export async function setWarningLevel(
  user: AuthUser,
  input: { warningId: string; level: WarningLevel; note?: string },
) {
  requireCapability(user, 'raise:early-warning')
  const row = await loadWarningRow(input.warningId)
  assertWarningScope(user, row)
  if (row.resolved_at) throw new AppError('A resolved warning cannot be escalated.', 409)

  const fromIndex = WARNING_LEVELS.indexOf(row.level)
  const toIndex = WARNING_LEVELS.indexOf(input.level)
  if (toIndex !== fromIndex + 1) {
    throw new AppError(`A warning can only be escalated one step at a time (from “${row.level}”).`, 409)
  }

  await query('update early_warnings set level = $1 where id = $2', [input.level, row.id])
  await query(
    `insert into audit_log (actor_user_id, actor_label, action, entity_type, entity_id, outcome, detail)
     values ($1,$2,'warning.level_changed','warning',$3,'success',$4)`,
    [user.id, `${user.name} (${user.role})`, row.public_id, JSON.stringify({ from: row.level, to: input.level, note: input.note ?? null })],
  )

  if (input.level === 'Urgent') {
    const admins = (
      await query<Record<string, unknown>>("select * from users where kind = 'command' and active = true")
    ).rows
    for (const admin of admins) {
      if (admin.id === user.id) continue
      if (!can(String(admin.role), 'view:early-warning')) continue
      if (!adminSeesState(admin, row.state, row.lga)) continue
      await query(
        `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
         values ($1,'warning',$2,$3,'warning',$4)`,
        [admin.id, `Urgent early warning: ${row.title}`, `${row.lga}, ${row.state}. Escalated by ${user.name}`, row.public_id],
      )
    }
  }
}

export async function resolveWarning(
  user: AuthUser,
  input: { warningId: string; note?: string },
) {
  requireCapability(user, 'raise:early-warning')
  const row = await loadWarningRow(input.warningId)
  assertWarningScope(user, row)
  if (row.resolved_at) throw new AppError('This warning is already resolved.', 409)

  await query('update early_warnings set resolved_at = now(), resolved_by = $1, resolution_note = $2 where id = $3', [
    user.id,
    input.note?.trim() || null,
    row.id,
  ])
  await query(
    `insert into audit_log (actor_user_id, actor_label, action, entity_type, entity_id, outcome, detail)
     values ($1,$2,'warning.resolved','warning',$3,'success',$4)`,
    [user.id, `${user.name} (${user.role})`, row.public_id, JSON.stringify({ note: input.note ?? null })],
  )
}

export async function publishWarning(
  user: AuthUser,
  input: { warningId: string; access: WarningAccess },
) {
  requireCapability(user, 'raise:early-warning')
  const row = await loadWarningRow(input.warningId)
  assertWarningScope(user, row)
  if (row.resolved_at) throw new AppError('A resolved warning cannot be re-published.', 409)
  if (!WARNING_ACCESS.includes(input.access)) throw new AppError('Unknown audience.', 400)

  await query('update early_warnings set access = $1 where id = $2', [input.access, row.id])
  await query(
    `insert into audit_log (actor_user_id, actor_label, action, entity_type, entity_id, outcome, detail)
     values ($1,$2,'warning.published','warning',$3,'success',$4)`,
    [user.id, `${user.name} (${user.role})`, row.public_id, JSON.stringify({ access: input.access })],
  )
}

/* Coverage & duty ----------------------------------------------------------- */

export interface CoverageStateRow {
  state: string
  applications: number
  certified: number
  pusAssigned: number
  pusTotal: number
  checkedInToday: number
}

export interface DutyRow {
  applicationId: string
  guardName: string
  state: string
  lga: string
  pollingUnit: string
  at: string
  lat: number | null
  lng: number | null
}

export interface CoverageData {
  rows: CoverageStateRow[]
  duty: DutyRow[]
  registerImported: boolean
  generatedAt: string
}

export async function getCoverage(user: AuthUser): Promise<CoverageData> {
  requireCapability(user, 'view:analytics')

  let appSql = `select state_of_residence as state,
      count(*)::int as applications,
      count(*) filter (where status = 'Certified/Active')::int as certified,
      count(distinct polling_unit) filter (where status = 'Certified/Active' and polling_unit <> 'To be assigned')::int as pus_assigned
    from applications`
  let appParams: unknown[] = []
  if (user.scope_kind !== 'national') {
    const scope = scopeClause(user, 'state_of_residence', 'lga', 1)
    if (scope.sql !== 'true') {
      appSql += ` where ${scope.sql}`
      appParams = scope.params
    }
  }
  appSql += ' group by state_of_residence'
  const appRows = (await query<{ state: string; applications: number; certified: number; pus_assigned: number }>(appSql, appParams)).rows

  let puSql = `select s.name as state, count(p.id)::int as pus_total
    from states s left join polling_units p on p.state_code = s.code`
  let puParams: unknown[] = []
  if (user.scope_kind === 'state' || user.scope_kind === 'lga' || user.scope_kind === 'self') {
    puSql += ' where s.name = $1'
    puParams = [user.scope_state]
  } else if (user.scope_kind === 'zone') {
    puSql += ' where s.name = any($1)'
    puParams = [zoneStates(user.scope_zone ?? '')]
  }
  puSql += ' group by s.name'
  const puRows = (await query<{ state: string; pus_total: number }>(puSql, puParams)).rows
  const puByState = new Map(puRows.map((row) => [row.state, row.pus_total]))
  const registerImported = puRows.some((row) => row.pus_total > 0)

  let dutySql = `select distinct on (c.application_id)
      c.application_id, c.polling_unit, c.checked_in_at, c.lat, c.lng,
      a.public_id, a.full_name, a.state_of_residence, a.lga
    from check_ins c
    join applications a on a.id = c.application_id`
  let dutyParams: unknown[] = []
  if (user.scope_kind !== 'national') {
    const scope = scopeClause(user, 'a.state_of_residence', 'a.lga', 1)
    if (scope.sql !== 'true') {
      dutySql += ` where ${scope.sql}`
      dutyParams = scope.params
    }
  }
  dutySql += ' order by c.application_id, c.checked_in_at desc limit 200'
  const dutyRowsRaw = (
    await query<{
      application_id: string
      polling_unit: string
      checked_in_at: Date
      lat: number | null
      lng: number | null
      public_id: string
      full_name: string
      state_of_residence: string
      lga: string
    }>(dutySql, dutyParams)
  ).rows

  const duty: DutyRow[] = dutyRowsRaw
    .map((row) => ({
      applicationId: row.public_id,
      guardName: row.full_name,
      state: row.state_of_residence,
      lga: row.lga,
      pollingUnit: row.polling_unit,
      at: row.checked_in_at.toISOString(),
      lat: row.lat === null ? null : Number(row.lat),
      lng: row.lng === null ? null : Number(row.lng),
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 100)

  let checkSql = `select a.state_of_residence as state, count(distinct c.application_id)::int as checked_in
    from check_ins c
    join applications a on a.id = c.application_id
    where (c.checked_in_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date`
  const checkParams: unknown[] = []
  if (user.scope_kind !== 'national') {
    const scope = scopeClause(user, 'a.state_of_residence', 'a.lga', 1)
    if (scope.sql !== 'true') {
      checkSql += ` and ${scope.sql}`
      checkParams.push(...scope.params)
    } else {
      checkSql += ' and true'
    }
  }
  checkSql += ' group by a.state_of_residence'
  const checkRows = (await query<{ state: string; checked_in: number }>(checkSql, checkParams)).rows
  const checkByState = new Map(checkRows.map((row) => [row.state, row.checked_in]))

  const statesInScope =
    user.scope_kind === 'national'
      ? STATES.map((s) => s.name)
      : user.scope_kind === 'zone'
        ? zoneStates(user.scope_zone ?? '')
        : [user.scope_state].filter((s): s is string => !!s)

  const appByState = new Map(appRows.map((row) => [row.state, row]))
  const rows: CoverageStateRow[] = statesInScope.map((state) => {
    const app = appByState.get(state)
    return {
      state,
      applications: app?.applications ?? 0,
      certified: app?.certified ?? 0,
      pusAssigned: app?.pus_assigned ?? 0,
      pusTotal: puByState.get(state) ?? 0,
      checkedInToday: checkByState.get(state) ?? 0,
    }
  })

  return { rows, duty, registerImported, generatedAt: new Date().toISOString() }
}

/* Roles & access administration --------------------------------------------- */

export interface CommandUserRow {
  id: string
  email: string
  name: string
  role: string
  scopeKind: string
  scopeZone: string | null
  scopeState: string | null
  scopeLga: string | null
  active: boolean
  createdAt: string
  lastSeenAt: string | null
  applicationId: string | null
}

const COMMAND_ROLES = [
  'Super Administrator',
  'National YEGO Administrator',
  'Regional Coordinator',
  'State Coordinator',
  'LGA Coordinator',
  'Verification Officer',
  'Training Officer',
] as const
type CommandRole = (typeof COMMAND_ROLES)[number]

function deriveScope(role: CommandRole, scopeZone?: string, scopeState?: string, scopeLga?: string) {
  switch (role) {
    case 'Super Administrator':
    case 'National YEGO Administrator':
    case 'Verification Officer':
      return { scope_kind: 'national', scope_zone: null, scope_state: null, scope_lga: null }
    case 'Regional Coordinator': {
      const zone = scopeZone?.trim()
      if (!zone || !zoneStates(zone).length) throw new AppError('Choose a valid geopolitical zone.', 400)
      return { scope_kind: 'zone', scope_zone: zone, scope_state: null, scope_lga: null }
    }
    case 'State Coordinator': {
      const state = scopeState?.trim()
      if (!state || !STATES.some((item) => item.name === state)) throw new AppError('Choose a valid state.', 400)
      return { scope_kind: 'state', scope_zone: null, scope_state: state, scope_lga: null }
    }
    case 'LGA Coordinator': {
      const state = scopeState?.trim()
      const lga = scopeLga?.trim()
      const stateRow = STATES.find((item) => item.name === state)
      if (!stateRow || !lga || !stateRow.lgas.includes(lga)) {
        throw new AppError('Choose a valid state and an LGA inside it.', 400)
      }
      return { scope_kind: 'lga', scope_zone: null, scope_state: state, scope_lga: lga }
    }
    case 'Training Officer':
      return { scope_kind: 'training', scope_zone: null, scope_state: null, scope_lga: null }
  }
}

async function activeSuperAdminCount(excludeUserId?: string): Promise<number> {
  const result = await query<{ n: number }>(
    `select count(*)::int as n from users
     where role = 'Super Administrator' and active = true and ($1::uuid is null or id <> $1)`,
    [excludeUserId ?? null],
  )
  return result.rows[0]?.n ?? 0
}

export async function listCommandUsers(user: AuthUser): Promise<CommandUserRow[]> {
  requireCapability(user, 'manage:roles')
  const rows = (
    await query<{
      id: string
      email: string
      name: string
      role: string
      scope_kind: string
      scope_zone: string | null
      scope_state: string | null
      scope_lga: string | null
      active: boolean
      created_at: Date
      last_seen_at: Date | null
      application_public_id: string | null
    }>(
      `select u.id, u.email, u.name, u.role, u.kind, u.scope_kind, u.scope_zone, u.scope_state, u.scope_lga,
              u.active, u.created_at,
              (select max(s.last_seen_at) from sessions s where s.user_id = u.id) as last_seen_at,
              (select a.public_id from applications a where a.id = u.application_id) as application_public_id
       from users u
       where u.kind = 'command'
       order by u.created_at, u.name`,
    )
  ).rows
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    scopeKind: row.scope_kind,
    scopeZone: row.scope_zone,
    scopeState: row.scope_state,
    scopeLga: row.scope_lga,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
    applicationId: row.application_public_id,
  }))
}

export async function createCommandUser(
  user: AuthUser,
  input: { email: string; name: string; role: string; scopeZone?: string; scopeState?: string; scopeLga?: string; password?: string },
): Promise<{ user: CommandUserRow; generatedPassword?: string }> {
  requireCapability(user, 'manage:roles')
  const role = input.role as CommandRole
  if (!COMMAND_ROLES.includes(role)) throw new AppError('Choose a valid Command role.', 400)

  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Enter a valid email address.', 400)
  const name = input.name.trim()
  if (name.length < 3) throw new AppError('Enter the full name.', 400)

  let password = input.password
  let generatedPassword: string | undefined
  if (password) {
    if (password.length < 10) throw new AppError('Use a password of at least 10 characters.', 400)
  } else {
    generatedPassword = randomToken(12)
    password = generatedPassword
  }

  const scope = deriveScope(role, input.scopeZone, input.scopeState, input.scopeLga)
  const created = await transaction(async (client) => {
    const inserted = await client
      .query<Record<string, unknown>>(
        `insert into users (email, password_hash, name, role, kind, scope_kind, scope_zone, scope_state, scope_lga)
       values ($1,$2,$3,$4,'command',$5,$6,$7,$8) returning *`,
        [email, hashPassword(password), name, role, scope.scope_kind, scope.scope_zone, scope.scope_state, scope.scope_lga],
      )
      .catch((error: unknown) => {
        if (error instanceof Error && /unique/i.test(error.message)) {
          throw new AppError('An account with that email already exists.', 409)
        }
        throw error
      })
    await client.query(
      `insert into audit_log (actor_user_id, actor_label, action, entity_type, entity_id, outcome, detail)
       values ($1,$2,'user.created','user',$3,'success',$4)`,
      [user.id, `${user.name} (${user.role})`, String(inserted.rows[0].id), JSON.stringify({ email, role, scope })],
    )
    return inserted.rows[0]
  })

  const row = mapAuthUser(created)
  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      scopeKind: row.scope_kind,
      scopeZone: row.scope_zone,
      scopeState: row.scope_state,
      scopeLga: row.scope_lga,
      active: true,
      createdAt: new Date().toISOString(),
      lastSeenAt: null,
      applicationId: null,
    },
    generatedPassword,
  }
}

export async function setUserActive(user: AuthUser, input: { userId: string; active: boolean }) {
  requireCapability(user, 'manage:roles')
  const target = await one<Record<string, unknown>>('select * from users where id = $1 and kind = $2', [input.userId, 'command'])
  if (!target) throw new AppError('Account not found.', 404)

  if (!input.active) {
    if (target.id === user.id) throw new AppError('You cannot deactivate your own account.', 409)
    if (target.role === 'Super Administrator' && (await activeSuperAdminCount(String(target.id))) < 1) {
      throw new AppError('At least one active Super Administrator must remain.', 409)
    }
  }

  await transaction(async (client) => {
    await client.query('update users set active = $1 where id = $2', [input.active, input.userId])
    if (!input.active) {
      await client.query('delete from sessions where user_id = $1', [input.userId])
    }
    await client.query(
      `insert into audit_log (actor_user_id, actor_label, action, entity_type, entity_id, outcome, detail)
       values ($1,$2,$3,'user',$4,'success',$5)`,
      [user.id, `${user.name} (${user.role})`, input.active ? 'user.activated' : 'user.deactivated', input.userId, JSON.stringify({ email: target.email })],
    )
  })
}

export async function setUserRole(
  user: AuthUser,
  input: { userId: string; role: string; scopeZone?: string; scopeState?: string; scopeLga?: string },
) {
  requireCapability(user, 'manage:roles')
  const role = input.role as CommandRole
  if (!COMMAND_ROLES.includes(role)) throw new AppError('Choose a valid Command role.', 400)
  const target = await one<Record<string, unknown>>('select * from users where id = $1 and kind = $2', [input.userId, 'command'])
  if (!target) throw new AppError('Account not found.', 404)
  if (target.id === user.id) throw new AppError('You cannot change your own role.', 409)
  if (target.role === 'Super Administrator' && role !== 'Super Administrator') {
    if ((await activeSuperAdminCount(String(target.id))) < 1) {
      throw new AppError('At least one active Super Administrator must remain.', 409)
    }
  }

  const scope = deriveScope(role, input.scopeZone, input.scopeState, input.scopeLga)
  await transaction(async (client) => {
    await client.query(
      'update users set role = $1, scope_kind = $2, scope_zone = $3, scope_state = $4, scope_lga = $5 where id = $6',
      [role, scope.scope_kind, scope.scope_zone, scope.scope_state, scope.scope_lga, input.userId],
    )
    await client.query(
      `insert into audit_log (actor_user_id, actor_label, action, entity_type, entity_id, outcome, detail)
       values ($1,$2,'user.role_changed','user',$3,'success',$4)`,
      [user.id, `${user.name} (${user.role})`, input.userId, JSON.stringify({ from: target.role, to: role, scope })],
    )
  })
}
