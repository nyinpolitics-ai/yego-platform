import { createHash } from 'node:crypto'

import { AppError, hashPassword } from './security.server'
import { isDatabaseConfigured, one, pool, query, transaction } from './db.server'

// The migrations are bundled into the server build with ?raw imports, so
// the bootstrap wizard can initialise a fresh cloud database (Neon) even when
// no filesystem access to netlify/database/migrations exists (Netlify Functions).
import sql0001 from '../../netlify/database/migrations/0001_init.sql?raw'
import sql0002 from '../../netlify/database/migrations/0002_sequences.sql?raw'
import sql0003 from '../../netlify/database/migrations/0003_polling_unit_index.sql?raw'
import sql0004 from '../../netlify/database/migrations/0004_seed_reference_geography.sql?raw'
import sql0005 from '../../netlify/database/migrations/0005_warning_resolution_and_outbound.sql?raw'
import sql0006 from '../../netlify/database/migrations/0006_applicant_email_verification.sql?raw'
import sql0007 from '../../netlify/database/migrations/0007_guard_initial_password.sql?raw'

const MIGRATIONS: ReadonlyArray<readonly [string, string]> = [
  ['0001_init.sql', sql0001],
  ['0002_sequences.sql', sql0002],
  ['0003_polling_unit_index.sql', sql0003],
  ['0004_seed_reference_geography.sql', sql0004],
  ['0005_warning_resolution_and_outbound.sql', sql0005],
  ['0006_applicant_email_verification.sql', sql0006],
  ['0007_guard_initial_password.sql', sql0007],
]

const ADVISORY_LOCK_KEY = 824601 // same key as scripts/migrate.mjs
const DEMO_VERSION = 1

export interface SetupStatus {
  dbConfigured: boolean
  reachable: boolean
  tablesReady: boolean
  migrationsApplied: number
  migrationsTotal: number
  userCount: number
  demoPresent: boolean
  /** True once the platform has been bootstrapped: the wizard is then permanently disabled. */
  locked: boolean
}

export interface SetupInput {
  token: string
  email: string
  name?: string
  password: string
  confirm: string
  demo: boolean
}

export interface SetupResult {
  applied: string[]
  skipped: number
  adminEmail: string
  demo: { applications: number; incidents: number; warnings: number; accounts: number } | null
}

function isMissingTable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '42P01'
}

/** Snapshot of the database state, rendered by the /setup wizard. */
export async function setupStatus(): Promise<SetupStatus> {
  const status: SetupStatus = {
    dbConfigured: isDatabaseConfigured(),
    reachable: false,
    tablesReady: false,
    migrationsApplied: 0,
    migrationsTotal: MIGRATIONS.length,
    userCount: 0,
    demoPresent: false,
    locked: false,
  }
  if (!status.dbConfigured) return status

  try {
    const applied = await one<{ count: string }>('select count(*)::text as count from schema_migrations')
    status.reachable = true
    status.tablesReady = true
    status.migrationsApplied = Number(applied?.count ?? 0)
    const users = await one<{ count: string }>('select count(*)::text as count from users')
    status.userCount = Number(users?.count ?? 0)
    status.locked = status.userCount > 0
    const demo = await one<{ value: string }>("select value from settings where key = 'demo_seed_version'")
    status.demoPresent = demo?.value === JSON.stringify(DEMO_VERSION)
  } catch (error) {
    if (isMissingTable(error)) {
      // Database reachable but empty: this is exactly what the wizard fixes.
      status.reachable = true
      status.tablesReady = false
      return status
    }
    throw error
  }
  return status
}

/** Applies pending migrations. Safe to run repeatedly (checksum-guarded). */
export async function runMigrations(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
): Promise<string[]> {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `)
  const applied = new Map(
    (await query<{ version: string }>('select version from schema_migrations')).rows.map((r) => [r.version, true]),
  )

  const appliedNow: string[] = []
  for (const [file, sql] of MIGRATIONS) {
    if (applied.has(file)) continue
    await client.query('begin')
    try {
      await client.query(sql)
      const checksum = createHash('sha256').update(sql).digest('hex')
      await client.query('insert into schema_migrations (version, checksum) values ($1, $2)', [file, checksum])
      await client.query('commit')
      appliedNow.push(file)
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  }
  return appliedNow
}

function assertValidInput(input: SetupInput): void {
  const email = input.email?.trim().toLowerCase() ?? ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError('Enter a valid email address for the administrator.')
  if (!input.password || input.password.length < 12) throw new AppError('The password must be at least 12 characters long.')
  if (input.password !== input.confirm) throw new AppError('The two passwords do not match.')
}

async function createSuperAdmin(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> },
  input: SetupInput,
): Promise<string> {
  const email = input.email.trim().toLowerCase()
  const name = input.name?.trim() || 'Super Administrator'
  const hash = hashPassword(input.password)
  const updated = await client.query(
    `update users
     set password_hash = $2, name = $3, role = 'Super Administrator',
         kind = 'command', scope_kind = 'national', active = true
     where lower(email) = $1`,
    [email, hash, name],
  )
  if (!updated.rowCount) {
    await client.query(
      `insert into users (email, password_hash, name, role, kind, scope_kind, active)
       values ($1,$2,$3,'Super Administrator','command','national',true)`,
      [email, hash, name],
    )
  }
  return email
}

// ---------------------------------------------------------------------------
// Demonstration data (port of scripts/seed.mjs --demo) so a non-technical
// operator can load the sample dashboards from the browser wizard alone.
// ---------------------------------------------------------------------------

function appState(
  account: { applicationId?: string },
  applications: { id: string; stateOfResidence?: string | null }[],
): string | null {
  return applications.find((item) => item.id === account.applicationId)?.stateOfResidence ?? null
}

function appLga(
  account: { applicationId?: string },
  applications: { id: string; lga?: string | null }[],
): string | null {
  return applications.find((item) => item.id === account.applicationId)?.lga ?? null
}

export async function resetDemoData(client: { query: (sql: string) => Promise<unknown> }): Promise<void> {
  await client.query(`
    truncate table
      notifications, sessions, login_attempts, audit_log,
      training_attempts, certificates, check_ins,
      referral_events, incident_referrals, incident_history, incident_evidence, incidents,
      early_warnings, announcements,
      application_history, consent_records, users, applications
    restart identity cascade
  `)
}

export async function seedDemoData(client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: { id: number }[]; rowCount: number | null }>
}): Promise<{ applications: number; incidents: number; warnings: number; accounts: number }> {
  const { SEED_APPLICATIONS, SEED_INCIDENTS, SEED_WARNINGS, SEED_ANNOUNCEMENTS, DEMO_ACCOUNTS, AGENCIES, TRAINING_MODULES } =
    await import('@/lib/fixtures')

  const appIds = new Map<string, number>()
  const userIds = new Map<string, number>()

  for (const app of SEED_APPLICATIONS) {
    const row = await client.query(
      `insert into applications
        (public_id, yego_id, full_name, gender, date_of_birth, phone, whatsapp, email,
         nin_ciphertext, nin_last4, state_of_origin, state_of_residence, lga, ward,
         preferred_polling_unit, polling_unit, background, experience, photo_data,
         status, whatsapp_confirmed_at, training_progress, submitted_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23)
       returning id`,
      [
        app.id,
        app.yegoId ?? null,
        app.fullName,
        app.gender,
        app.dateOfBirth,
        app.phone,
        app.whatsapp,
        app.email,
        null,
        app.nin ? app.nin.slice(-4) : null,
        app.stateOfOrigin,
        app.stateOfResidence,
        app.lga,
        app.ward,
        app.pollingUnit,
        app.pollingUnit,
        app.background,
        app.experience,
        app.photo ?? null,
        app.status,
        app.confirmedWhatsApp ? app.submittedAt : null,
        app.trainingProgress,
        app.submittedAt,
      ],
    )
    const dbId = row.rows[0].id
    appIds.set(app.id, dbId)

    for (const h of app.history) {
      await client.query(
        `insert into application_history (application_id, action, note, actor_label, created_at)
         values ($1,$2,$3,$4,$5)`,
        [dbId, h.action, h.note ?? null, h.by, h.at],
      )
    }
    await client.query(
      `insert into consent_records (application_id, kind, version, accepted_at) values
        ($1,'non_partisanship','2026-10',$2),
        ($1,'code_of_conduct','2026-10',$2),
        ($1,'data_use','2026-10',$2)`,
      [dbId, app.submittedAt],
    )
  }

  const demoGuardId = appIds.get('YG-APP-242858')
  if (demoGuardId) {
    for (const module of TRAINING_MODULES) {
      await client.query(
        `insert into training_attempts (application_id, module_id, answers, score, passed)
         values ($1,$2,'[]',85,true)`,
        [demoGuardId, module.id],
      )
    }
  }

  const password = 'yego-preview'
  for (const account of DEMO_ACCOUNTS) {
    const scope =
      account.kind === 'guard'
        ? { kind: 'self', state: appState(account, SEED_APPLICATIONS), zone: null, lga: appLga(account, SEED_APPLICATIONS) }
        : account.role === 'State Coordinator'
          ? { kind: 'state', state: 'Lagos', zone: 'South West', lga: null }
          : account.scope === 'Training Centre'
            ? { kind: 'training', state: null, zone: null, lga: null }
            : { kind: 'national', state: null, zone: null, lga: null }

    const appDbId = account.applicationId ? appIds.get(account.applicationId) : null
    const row = await client.query(
      `insert into users
        (email, password_hash, name, role, kind, scope_kind, scope_zone, scope_state, scope_lga, application_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id`,
      [
        account.email,
        hashPassword(password),
        account.name,
        account.role,
        account.kind,
        scope.kind,
        scope.zone,
        scope.state,
        scope.lga,
        appDbId,
      ],
    )
    userIds.set(account.email, row.rows[0].id)
  }

  for (const inc of SEED_INCIDENTS) {
    const row = await client.query(
      `insert into incidents
        (public_id, type, description, severity, state, lga, ward, polling_unit, lat, lng,
         occurred_at, reported_at, reporter_name, reporter_id, reporter_user_id, status,
         category, election_day, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$12,$12)
       returning id`,
      [
        inc.id,
        inc.type,
        inc.description,
        inc.severity,
        inc.state,
        inc.lga,
        inc.ward,
        inc.pollingUnit,
        inc.lat,
        inc.lng,
        inc.occurredAt,
        inc.reportedAt,
        inc.reporter,
        inc.reporterId,
        userIds.get('funmi@example.ng') ?? null,
        inc.status,
        inc.category ?? null,
        inc.electionDay,
      ],
    )
    const incidentId = row.rows[0].id

    for (const e of inc.evidence) {
      await client.query(
        `insert into incident_evidence (incident_id, kind, file_name, storage_key) values ($1,$2,$3,$4)`,
        [incidentId, e.kind, e.name, null],
      )
    }
    for (const a of inc.audit) {
      await client.query(
        `insert into incident_history (incident_id, action, note, actor_label, created_at)
         values ($1,$2,$3,$4,$5)`,
        [incidentId, a.action, a.note ?? null, a.by, a.at],
      )
    }
    for (const r of inc.referrals) {
      const agency = AGENCIES.find((x) => x.code === r.agency)
      const ref = await client.query(
        `insert into incident_referrals (incident_id, agency_code, agency_name, status, created_at, updated_at)
         values ($1,$2,$3,'pending_manual',$4,$4) returning id`,
        [incidentId, r.agency, agency?.name ?? r.agency, r.at],
      )
      await client.query(
        `insert into referral_events (referral_id, event, detail, created_at)
         values ($1,'created','Seeded referral; no external delivery attempted',$2)`,
        [ref.rows[0].id, r.at],
      )
    }
  }

  const warningIds: number[] = []
  for (const w of SEED_WARNINGS) {
    const row = await client.query(
      `insert into early_warnings
        (public_id, type, title, summary, state, lga, level, access, raised_by_label,
         evidence_count, lat, lng, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [w.id, w.type, w.title, w.summary, w.state, w.lga, w.level, w.access, w.raisedBy, w.evidence, w.lat, w.lng, w.raisedAt],
    )
    warningIds.push(row.rows[0].id)
  }

  for (const a of SEED_ANNOUNCEMENTS) {
    await client.query(
      `insert into announcements (from_label, tier, kind, title, body, audience, created_at)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [a.from, a.tier, a.kind, a.title, a.body, a.audience, a.at],
    )
  }

  const commandUsers = ['superadmin@yego.ng', 'command@yego.ng', 'verify@yego.ng', 'lagos@yego.ng']
  for (const email of commandUsers) {
    const uid = userIds.get(email)
    if (!uid) continue
    const lagos = email === 'lagos@yego.ng'
    await client.query(
      `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
       values ($1,'incident',$2,$3,'incident',$4)`,
      lagos
        ? [uid, 'New incident in Lagos', 'BVAS / technology failure at PU 027 – Randle Ave. Open Space, Lagos. Awaiting verification.', 'INC-26-000196']
        : [uid, 'New critical incident reported', 'Violence / physical attack at PU 009 – Rumuokoro Town Hall, Rivers. Awaiting verification.', 'INC-26-000191'],
    )
  }
  const guardId = userIds.get('funmi@example.ng')
  if (guardId) {
    await client.query(
      `insert into notifications (user_id, kind, title, body, entity_type, entity_id)
       values ($1,'training','Training refresh available','Module 4 has new examples for results-sheet photography.','announcement',null)`,
      [guardId],
    )
  }

  await client.query(
    `insert into settings (key, value) values ('demo_seed_version', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(DEMO_VERSION)],
  )

  return {
    applications: SEED_APPLICATIONS.length,
    incidents: SEED_INCIDENTS.length,
    warnings: SEED_WARNINGS.length,
    accounts: DEMO_ACCOUNTS.length,
  }
}

// ---------------------------------------------------------------------------
// One-shot bootstrap action behind SETUP_TOKEN.
// ---------------------------------------------------------------------------

async function assertSetupToken(token: string): Promise<void> {
  const expected = process.env.SETUP_TOKEN
  if (!expected) {
    throw new AppError(
      'Setup is disabled on this server. Set the SETUP_TOKEN environment variable first, then redeploy.',
    )
  }
  if (typeof token !== 'string' || token.length !== expected.length || token !== expected) {
    // Constant-shape delay blunts online guessing without leaking timing detail.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    throw new AppError('Invalid setup token.')
  }
}

/**
 * The bootstrap wizard is a one-shot tool. Once any user account exists the
 * platform is live, so setup is refused outright: a leaked or guessed
 * SETUP_TOKEN must never be able to overwrite the administrator or wipe the
 * database with demonstration data.
 */
async function assertNotBootstrapped(): Promise<void> {
  try {
    const existing = await one<{ count: string }>('select count(*)::text as count from users')
    if (Number(existing?.count ?? 0) > 0) {
      throw new AppError(
        'YEGO is already set up, so the bootstrap wizard is locked. Delete the SETUP_TOKEN environment variable on your host and redeploy to retire this page.',
      )
    }
  } catch (error) {
    // A fresh database has no tables yet: that is exactly what setup is for.
    if (!isMissingTable(error)) throw error
  }
}

/**
 * Initialises a fresh cloud database: migrations, optional demo data, and the
 * first Super Administrator. Guarded by SETUP_TOKEN and safe to re-run.
 */
export async function performSetup(input: SetupInput): Promise<SetupResult> {
  await assertSetupToken(input.token)
  await assertNotBootstrapped()
  assertValidInput(input)

  let applied: string[]
  const client = await pool().connect()
  try {
    await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])
    try {
      applied = await runMigrations(client)
    } finally {
      await client.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
    }
  } finally {
    client.release()
  }

  let demo: SetupResult['demo'] = null
  if (input.demo) {
    await transaction(async (tx) => {
      await resetDemoData(tx)
      demo = await seedDemoData(tx)
    })
  }

  const adminEmail = await transaction(async (tx) => createSuperAdmin(tx, input))

  return { applied, skipped: 0, adminEmail, demo }
}
