// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { mapAuthUser } from '@/server/auth.server'
import { query } from '@/server/db.server'
import {
  assignPollingUnit,
  createCommandUser,
  getCoverage,
  getTrainingRoster,
  listCommandUsers,
  messageApplicant,
  publishWarning,
  reportIncidentByCommand,
  resolveWarning,
  setWarningLevel,
  setUserActive,
  setUserRole,
  updateTrainingProgress,
  bootstrap,
  checkIn,
  createApplication,
  lookupApplication,
  raiseWarning,
  referIncident,
  setApplicationStatus,
  setIncidentStatus,
  submitIncident,
  submitTrainingQuiz,
} from '@/server/repo.server'
import { processPendingMessages } from '@/server/notify.server'
import type { AuthUser } from '@/server/scope.server'

const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const stamp = Date.now().toString(36)
let counter = 0
const createdApplications: string[] = []
const createdIncidents: string[] = []
const createdUsers: string[] = []

function nextPhone() {
  counter += 1
  return `0803${String(1000000 + counter).slice(-7)}`
}

async function makeApplication(overrides: Record<string, unknown> = {}) {
  counter += 1
  const application = await createApplication({
    fullName: `Test Applicant ${stamp}${counter}`,
    gender: 'Female',
    dateOfBirth: '1998-05-10',
    phone: nextPhone(),
    whatsapp: nextPhone(),
    nin: String(10000000000 + counter).slice(-11),
    email: `test-${stamp}-${counter}@example.ng`,
    stateOfOrigin: 'Kano',
    stateOfResidence: 'Kano',
    lga: 'Nasarawa',
    ward: 'Gwagwarwa',
    pollingUnit: 'PU 012 – Gwagwarwa Pri. Sch.',
    background: 'Student (tertiary)',
    experience: 'Campus voter education volunteer.',
    photo: PHOTO,
    nonPartisan: true,
    codeOfConduct: true,
    dataConsent: true,
    ...overrides,
  })
  createdApplications.push(application.id)
  return application
}

async function applicationRow(publicId: string) {
  return (
    await query<{ id: string; phone: string; state_of_residence: string; lga: string }>(
      'select id, phone, state_of_residence, lga from applications where public_id = $1',
      [publicId],
    )
  ).rows[0]
}

async function makeGuard(applicationId: string, state: string, lga: string): Promise<AuthUser> {
  const row = await query<Record<string, unknown>>(
    `insert into users (email, password_hash, name, role, kind, scope_kind, scope_state, scope_lga, application_id)
     values ($1,'test-only','Test Guard','YEGO Guard','guard','self',$2,$3,$4) returning *`,
    [`guard-${stamp}-${counter}-${Math.random().toString(36).slice(2, 6)}@test.local`, state, lga, applicationId],
  )
  createdUsers.push(String(row.rows[0].id))
  return mapAuthUser(row.rows[0])
}

let national: AuthUser
let verification: AuthUser
let lagosCoordinator: AuthUser
let trainingOfficer: AuthUser
let superadmin: AuthUser

beforeAll(async () => {
  // These tests create and delete records. Never point them at a hosted database.
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL ?? process.env.NETLIFY_DATABASE_URL ?? ''
  if (url && !/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('Integration tests only run against a local database. Unset DATABASE_URL/NETLIFY_DB_URL.')
  }

  const healthy = await query<{ ok: number }>('select 1 as ok')
  expect(healthy.rows[0].ok).toBe(1)

  const nationalRow = await query<Record<string, unknown>>("select * from users where email = 'command@yego.ng'")
  const verificationRow = await query<Record<string, unknown>>("select * from users where email = 'verify@yego.ng'")
  const lagosRow = await query<Record<string, unknown>>("select * from users where email = 'lagos@yego.ng'")
  const trainingRow = await query<Record<string, unknown>>("select * from users where email = 'training@yego.ng'")
  const superRow = await query<Record<string, unknown>>("select * from users where email = 'superadmin@yego.ng'")
  if (!nationalRow.rows[0] || !verificationRow.rows[0] || !lagosRow.rows[0] || !trainingRow.rows[0] || !superRow.rows[0]) {
    throw new Error('Seed accounts are missing. Run `pnpm db:seed --demo --reset` before integration tests.')
  }
  national = mapAuthUser(nationalRow.rows[0])
  verification = mapAuthUser(verificationRow.rows[0])
  lagosCoordinator = mapAuthUser(lagosRow.rows[0])
  trainingOfficer = mapAuthUser(trainingRow.rows[0])
  superadmin = mapAuthUser(superRow.rows[0])
})

const createdWarnings: string[] = []
const createdOutbound: string[] = []

afterAll(async () => {
  if (createdApplications.length) {
    await query(
      'delete from notifications where entity_id = any($1::text[])',
      [createdApplications],
    )
    await query('delete from audit_log where entity_id = any($1::text[])', [createdApplications])
    await query('delete from applications where public_id = any($1::text[])', [createdApplications])
  }
  if (createdIncidents.length) {
    await query('delete from notifications where entity_id = any($1::text[])', [createdIncidents])
    await query('delete from audit_log where entity_id = any($1::text[])', [createdIncidents])
    await query('delete from incidents where public_id = any($1::text[])', [createdIncidents])
  }
  if (createdWarnings.length) {
    await query('delete from notifications where entity_id = any($1::text[])', [createdWarnings])
    await query('delete from audit_log where entity_id = any($1::text[])', [createdWarnings])
    await query('delete from early_warnings where public_id = any($1::text[])', [createdWarnings])
  }
  if (createdOutbound.length) {
    await query('delete from outbound_messages where id = any($1::uuid[])', [createdOutbound])
  }
  if (createdUsers.length) {
    await query('delete from sessions where user_id = any($1::uuid[])', [createdUsers])
    await query('delete from audit_log where entity_id = any($1::text[]) or actor_user_id = any($2::uuid[])', [createdUsers, createdUsers])
    await query('delete from users where id = any($1::uuid[])', [createdUsers])
  }
  await query("delete from users where application_id is null and email like 'guard-%@yego.local'")
})

describe('applications', () => {
  it('persists an application and returns it in a new connection', async () => {
    const application = await makeApplication()
    const stored = await applicationRow(application.id)
    expect(stored).toBeTruthy()
    expect(stored.id).toBeTruthy()

    const fetched = await lookupApplication(application.id, (await query<{ phone: string }>(
      'select phone from applications where public_id = $1',
      [application.id],
    )).rows[0].phone, 'test-integration')
    expect(fetched.id).toBe(application.id)
    expect(fetched.status).toBe('Application Submitted')
    expect(fetched.history.length).toBeGreaterThan(0)
  })

  it('generates unique application IDs under concurrent submissions', async () => {
    const submissions = await Promise.all(Array.from({ length: 6 }, (_, index) => makeApplication({ phone: nextPhone(), email: `concurrent-${stamp}-${index}@example.ng` })))
    const ids = new Set(submissions.map((item) => item.id))
    expect(ids.size).toBe(submissions.length)
    const rows = await query<{ n: number }>('select count(*)::int as n from applications where public_id = any($1::text[])', [
      [...ids],
    ])
    expect(rows.rows[0].n).toBe(submissions.length)
  })

  it('does not expose NIN, phone or email in a status lookup', async () => {
    const application = await makeApplication()
    const stored = await applicationRow(application.id)
    const safe = await lookupApplication(application.id, stored.phone, 'test-integration')
    expect(safe.phone).toBe('')
    expect(safe.email).toBe('')
    expect(safe.nin).not.toMatch(/\d{7}/)
    expect(safe.fullName).toContain('Test Applicant')
  })

  it('rejects a status lookup with the wrong phone number', async () => {
    const application = await makeApplication()
    await expect(lookupApplication(application.id, '08030000000', 'test-integration')).rejects.toThrow(
      /No application matches/,
    )
  })

  it('enforces the application workflow and role capabilities', async () => {
    const application = await makeApplication()
    const trainingWithNationalScope: AuthUser = {
      ...trainingOfficer,
      scope_kind: 'national',
      scope_state: null,
      scope_lga: null,
    }
    await expect(
      setApplicationStatus(trainingWithNationalScope, { applicationId: application.id, status: 'Approved' }),
    ).rejects.toThrow(/cannot perform this action/)

    await setApplicationStatus(national, { applicationId: application.id, status: 'Under Review', note: 'Checked by test' })
    const row = await query<{ status: string }>('select status from applications where public_id = $1', [application.id])
    expect(row.rows[0].status).toBe('Under Review')

    await expect(
      setApplicationStatus(national, { applicationId: application.id, status: 'Certified/Active' }),
    ).rejects.toThrow(/cannot jump|cannot move/)
  })

  it('refuses certification before training is complete', async () => {
    const application = await makeApplication()
    await query("update applications set status = 'Training Completed', training_progress = 0 where public_id = $1", [
      application.id,
    ])
    await expect(
      setApplicationStatus(national, { applicationId: application.id, status: 'Certified/Active' }),
    ).rejects.toThrow(/Training must be completed/)
  })

  it('records training attempts and updates progress from validated answers', async () => {
    const application = await makeApplication()
    const stored = await applicationRow(application.id)
    await query("update applications set status = 'Training Required' where id = $1", [stored.id])
    const guard = await makeGuard(stored.id, 'Kano', 'Nasarawa')

    const wrong = await submitTrainingQuiz(guard, { moduleId: 'm1', answers: [0, 0] })
    expect(wrong.passed).toBe(false)

    const correct = await submitTrainingQuiz(guard, { moduleId: 'm1', answers: [1, 1] })
    expect(correct.passed).toBe(true)
    expect(correct.progress).toBe(11)
  })
})

describe('geographic scope', () => {
  it('limits a State Coordinator to their own state', async () => {
    const kanoApp = await makeApplication()
    expect(kanoApp.id).toBeTruthy()
    const data = await bootstrap(lagosCoordinator)
    expect(data.applications.length).toBeGreaterThan(0)
    expect(data.applications.every((application) => application.stateOfResidence === 'Lagos')).toBe(true)
    expect(data.incidents.every((incident) => incident.state === 'Lagos')).toBe(true)
    expect(data.applications.some((application) => application.id === kanoApp.id)).toBe(false)
  })

  it('limits a Guard to their own application and reports', async () => {
    const application = await makeApplication()
    const stored = await applicationRow(application.id)
    const guard = await makeGuard(stored.id, 'Kano', 'Nasarawa')
    const data = await bootstrap(guard)
    expect(data.applications.map((item) => item.id)).toEqual([application.id])
    expect(data.incidents.length).toBe(0)
  })

  it('blocks out-of-scope application decisions', async () => {
    const application = await makeApplication() // Kano
    await expect(
      setApplicationStatus(lagosCoordinator, { applicationId: application.id, status: 'Under Review' }),
    ).rejects.toThrow(/outside your assigned area/)
  })
})

describe('incident workflow', () => {
  it('persists a report, its verification history and a truthful referral', async () => {
    const application = await makeApplication()
    const stored = await applicationRow(application.id)
    await query("update applications set status = 'Certified/Active', training_progress = 100 where id = $1", [stored.id])
    const guard = await makeGuard(stored.id, 'Kano', 'Nasarawa')

    const incident = await submitIncident(guard, {
      type: 'Voter intimidation',
      description: 'Test incident created by the integration suite.',
      severity: 'High',
      lat: 12.0131,
      lng: 8.5541,
      occurredAt: new Date().toISOString(),
      evidence: [{ kind: 'photo', name: 'test.jpg' }],
      electionDay: true,
    })
    createdIncidents.push(incident.id)
    expect(incident.status).toBe('Reported')

    const received = await setIncidentStatus(verification, {
      incidentId: incident.id,
      status: 'Received',
      note: 'Acknowledged by test',
    })
    expect(received.status).toBe('Received')

    const verified = await setIncidentStatus(verification, {
      incidentId: incident.id,
      status: 'Verified',
      note: 'Evidence reviewed by test',
      category: 'Electoral offence',
    })
    expect(verified.audit.length).toBeGreaterThanOrEqual(3)

    const referred = await referIncident(verification, {
      incidentId: incident.id,
      agencies: ['NPF', 'ICCES'],
      note: 'Integration test referral',
    })
    expect(referred.status).toBe('Referred/Actioned')

    const referrals = await query<{ status: string }>(
      'select status from incident_referrals where incident_id = (select id from incidents where public_id = $1)',
      [incident.id],
    )
    expect(referrals.rows.length).toBe(2)
    expect(referrals.rows.every((row) => row.status === 'pending_manual')).toBe(true)

    const notifications = await query<{ n: number }>(
      "select count(*)::int as n from notifications where entity_id = $1 and kind = 'incident'",
      [incident.id],
    )
    expect(notifications.rows[0].n).toBeGreaterThan(0)
  })

  it('rejects an invalid status jump', async () => {
    const application = await makeApplication()
    const stored = await applicationRow(application.id)
    await query("update applications set status = 'Certified/Active', training_progress = 100 where id = $1", [stored.id])
    const guard = await makeGuard(stored.id, 'Kano', 'Nasarawa')
    const incident = await submitIncident(guard, {
      type: 'BVAS / technology failure',
      description: 'Transition test.',
      severity: 'Medium',
      lat: 12.01,
      lng: 8.55,
      occurredAt: new Date().toISOString(),
      evidence: [],
      electionDay: true,
    })
    createdIncidents.push(incident.id)
    await expect(
      setIncidentStatus(verification, { incidentId: incident.id, status: 'Closed' }),
    ).rejects.toThrow(/cannot move/)
  })

  it('requires the assignment capability and persists an assignment', async () => {
    const application = await makeApplication()
    await expect(
      assignPollingUnit(verification, {
        applicationId: application.id,
        ward: 'Ward D',
        pollingUnit: 'PU 027 – Randle Ave. Open Space',
      }),
    ).rejects.toThrow(/cannot perform this action/)

    await assignPollingUnit(national, {
      applicationId: application.id,
      ward: 'Ward D',
      pollingUnit: 'PU 027 – Randle Ave. Open Space',
    })
    const row = await query<{ ward: string; polling_unit: string }>(
      'select ward, polling_unit from applications where public_id = $1',
      [application.id],
    )
    expect(row.rows[0].polling_unit).toContain('PU 027')
  })


  it('lets a National Administrator report an incident for the queue', async () => {
    const incident = await reportIncidentByCommand(national, {
      state: 'Lagos',
      lga: 'Surulere',
      ward: 'Ward D',
      pollingUnit: 'PU 027 – Randle Ave. Open Space',
      type: 'Voter intimidation',
      severity: 'High',
      description: 'Report filed by the National Administrator during the integration test.',
      occurredAt: new Date().toISOString(),
      electionDay: false,
    })
    createdIncidents.push(incident.id)
    expect(incident.status).toBe('Reported')
    expect(incident.reporter).toContain('National YEGO Administrator')
  })

  it('lets a Verification Officer approve an applicant and message them', async () => {
    const application = await makeApplication()
    await setApplicationStatus(national, { applicationId: application.id, status: 'Under Review' })
    await setApplicationStatus(national, { applicationId: application.id, status: 'Screening' })
    await setApplicationStatus(verification, { applicationId: application.id, status: 'Approved' })
    const row = await query<{ status: string }>('select status from applications where public_id = $1', [application.id])
    expect(row.rows[0].status).toBe('Approved')

    await messageApplicant(verification, {
      applicationId: application.id,
      title: 'Screening complete',
      body: 'Your application has been approved. Watch the portal for training access.',
    })
    const notification = await query<{ n: number }>(
      "select count(*)::int as n from notifications n join users u on u.id = n.user_id join applications a on a.id = u.application_id where a.public_id = $1 and n.kind = 'applicant_message'",
      [application.id],
    )
    expect(notification.rows[0].n).toBe(1)
  })

  it('gives a Training Officer the roster and lets them record progress', async () => {
    const application = await makeApplication()
    const stored = await applicationRow(application.id)
    await query("update applications set status = 'Training Required', training_progress = 10 where id = $1", [stored.id])

    const roster = await getTrainingRoster(trainingOfficer)
    const row = roster.find((item) => item.applicationId === application.id)
    expect(row).toBeTruthy()
    expect(row?.trainingProgress).toBe(10)

    const updated = await updateTrainingProgress(trainingOfficer, {
      applicationId: application.id,
      progress: 100,
      note: 'All modules completed and verified by the Training Officer.',
    })
    expect(updated.progress).toBe(100)
    expect(updated.status).toBe('Training Completed')

    const history = await query<{ n: number }>(
      "select count(*)::int as n from application_history where application_id = $1 and action = 'Training progress updated'",
      [stored.id],
    )
    expect(history.rows[0].n).toBeGreaterThan(0)
  })

  it('gives a State Coordinator full operational capabilities inside the state', async () => {
    const application = await makeApplication({
      stateOfOrigin: 'Lagos',
      stateOfResidence: 'Lagos',
      lga: 'Surulere',
      ward: 'Ward D',
    })
    await setApplicationStatus(lagosCoordinator, { applicationId: application.id, status: 'Under Review' })
    const row = await query<{ status: string }>('select status from applications where public_id = $1', [application.id])
    expect(row.rows[0].status).toBe('Under Review')
  })
})

describe('early-warning board', () => {
  async function certifiedGuardWithWarning(state: string, lga: string) {
    const application = await makeApplication({ stateOfOrigin: state, stateOfResidence: state, lga })
    const stored = await applicationRow(application.id)
    await query("update applications set status = 'Certified/Active', training_progress = 100 where id = $1", [stored.id])
    const guard = await makeGuard(stored.id, state, lga)
    const warning = await raiseWarning(guard, {
      type: 'Emerging political tension',
      title: 'Integration test warning',
      summary: 'Raised by the integration suite to exercise the board workflow.',
      evidenceCount: 0,
    })
    createdWarnings.push(warning.id)
    return warning
  }

  it('escalates one level at a time, resolves, and audits each step', async () => {
    const warning = await certifiedGuardWithWarning('Kano', 'Nasarawa')

    await expect(setWarningLevel(national, { warningId: warning.id, level: 'Urgent' })).rejects.toThrow(
      /one step at a time/,
    )

    await setWarningLevel(national, { warningId: warning.id, level: 'Alert' })
    const alert = await query<{ level: string }>('select level from early_warnings where public_id = $1', [warning.id])
    expect(alert.rows[0].level).toBe('Alert')

    await setWarningLevel(national, { warningId: warning.id, level: 'Urgent' })
    const urgent = await query<{ level: string }>('select level from early_warnings where public_id = $1', [warning.id])
    expect(urgent.rows[0].level).toBe('Urgent')

    await resolveWarning(national, { warningId: warning.id, note: 'Monitored, no further reports.' })
    const resolved = await query<{ resolved_at: Date | null; resolution_note: string | null }>(
      'select resolved_at, resolution_note from early_warnings where public_id = $1',
      [warning.id],
    )
    expect(resolved.rows[0].resolved_at).toBeTruthy()
    expect(resolved.rows[0].resolution_note).toContain('Monitored')

    await expect(setWarningLevel(national, { warningId: warning.id, level: 'Alert' })).rejects.toThrow(/resolved/)
    const audit = await query<{ n: number }>(
      "select count(*)::int as n from audit_log where entity_id = $1 and action in ('warning.level_changed','warning.resolved')",
      [warning.id],
    )
    expect(audit.rows[0].n).toBe(3)
  })

  it('publishes a warning to a wider audience', async () => {
    const warning = await certifiedGuardWithWarning('Kano', 'Nasarawa')
    await publishWarning(national, { warningId: warning.id, access: 'All Guards in area' })
    const row = await query<{ access: string }>('select access from early_warnings where public_id = $1', [warning.id])
    expect(row.rows[0].access).toBe('All Guards in area')

    const audit = await query<{ n: number }>(
      "select count(*)::int as n from audit_log where entity_id = $1 and action = 'warning.published'",
      [warning.id],
    )
    expect(audit.rows[0].n).toBe(1)
  })

  it('blocks out-of-scope warning actions', async () => {
    const warning = await certifiedGuardWithWarning('Kano', 'Nasarawa')
    await expect(setWarningLevel(lagosCoordinator, { warningId: warning.id, level: 'Alert' })).rejects.toThrow(
      /outside your assigned area/,
    )
    await expect(resolveWarning(lagosCoordinator, { warningId: warning.id })).rejects.toThrow(
      /outside your assigned area/,
    )
  })
})

describe('coverage and duty', () => {
  it('aggregates applications, certified Guards and check-ins per state', async () => {
    const application = await makeApplication({ stateOfOrigin: 'Lagos', stateOfResidence: 'Lagos', lga: 'Surulere' })
    const stored = await applicationRow(application.id)
    await query("update applications set status = 'Certified/Active', training_progress = 100, polling_unit = 'PU 027 – Randle Ave. Open Space' where id = $1", [stored.id])
    const guard = await makeGuard(stored.id, 'Lagos', 'Surulere')
    await checkIn(guard, 6.4501, 3.3505)

    const coverage = await getCoverage(national)
    const lagos = coverage.rows.find((row) => row.state === 'Lagos')
    expect(lagos).toBeTruthy()
    expect(lagos!.applications).toBeGreaterThan(0)
    expect(lagos!.certified).toBeGreaterThan(0)
    expect(lagos!.pusAssigned).toBeGreaterThan(0)
    expect(lagos!.checkedInToday).toBeGreaterThan(0)

    const duty = coverage.duty.filter((row) => row.applicationId === application.id)
    expect(duty.length).toBe(1)
    expect(duty[0].guardName).toContain('Test Applicant')
    expect(duty[0].pollingUnit).toContain('PU 027')
  })

  it('locks a State Coordinator to their own state coverage', async () => {
    const coverage = await getCoverage(lagosCoordinator)
    expect(coverage.rows.length).toBe(1)
    expect(coverage.rows[0].state).toBe('Lagos')
    expect(coverage.duty.every((row) => row.state === 'Lagos')).toBe(true)
  })

  it('keeps Guard accounts out of coverage analytics', async () => {
    const application = await makeApplication()
    const stored = await applicationRow(application.id)
    const guard = await makeGuard(stored.id, 'Kano', 'Nasarawa')
    await expect(getCoverage(guard)).rejects.toThrow(/cannot perform this action/)
  })
})

describe('roles and access administration', () => {
  const suffix = `${Date.now().toString(36)}`

  it('lets only the Super Administrator manage accounts', async () => {
    await expect(listCommandUsers(national)).rejects.toThrow(/cannot perform this action/)
    const users = await listCommandUsers(superadmin)
    expect(users.length).toBeGreaterThan(0)
    expect(users.some((user) => user.email === 'lagos@yego.ng')).toBe(true)
  })

  it('creates a scoped account with a hashed password and returns generated credentials once', async () => {
    const result = await createCommandUser(superadmin, {
      name: 'Integration State Coordinator',
      email: `iscoord-${suffix}@test.local`,
      role: 'State Coordinator',
      scopeState: 'Lagos',
    })
    createdUsers.push(result.user.id)
    expect(result.user.scopeKind).toBe('state')
    expect(result.user.scopeState).toBe('Lagos')
    expect(result.generatedPassword).toBeTruthy()

    const row = await query<{ password_hash: string; kind: string }>('select password_hash, kind from users where id = $1', [result.user.id])
    expect(row.rows[0].kind).toBe('command')
    expect(row.rows[0].password_hash).not.toBe(result.generatedPassword)

    await expect(
      createCommandUser(superadmin, {
        name: 'Duplicate',
        email: `iscoord-${suffix}@test.local`,
        role: 'Verification Officer',
      }),
    ).rejects.toThrow(/already exists/)

    const list = await listCommandUsers(superadmin)
    expect(list.some((user) => user.email === `iscoord-${suffix}@test.local`)).toBe(true)
  })

  it('derives LGA scope and rejects invalid geography', async () => {
    const result = await createCommandUser(superadmin, {
      name: 'Integration LGA Coordinator',
      email: `ilga-${suffix}@test.local`,
      role: 'LGA Coordinator',
      scopeState: 'Lagos',
      scopeLga: 'Surulere',
    })
    createdUsers.push(result.user.id)
    expect(result.user.scopeKind).toBe('lga')
    expect(result.user.scopeLga).toBe('Surulere')

    await expect(
      createCommandUser(superadmin, {
        name: 'Invalid LGA',
        email: `ibad-${suffix}@test.local`,
        role: 'LGA Coordinator',
        scopeState: 'Lagos',
        scopeLga: 'Not a real LGA',
      }),
    ).rejects.toThrow(/valid state and an LGA/)
  })

  it('blocks self-deactivation', async () => {
    await expect(setUserActive(superadmin, { userId: superadmin.id, active: false })).rejects.toThrow(
      /cannot deactivate your own/,
    )
  })

  it('deactivates an account, revokes sessions and re-activates it', async () => {
    const result = await createCommandUser(superadmin, {
      name: 'Integration Officer',
      email: `iofficer-${suffix}@test.local`,
      role: 'Verification Officer',
    })
    createdUsers.push(result.user.id)

    await setUserActive(superadmin, { userId: result.user.id, active: false })
    const row = await query<{ active: boolean }>('select active from users where id = $1', [result.user.id])
    expect(row.rows[0].active).toBe(false)

    await setUserActive(superadmin, { userId: result.user.id, active: true })
    const reactived = await query<{ active: boolean }>('select active from users where id = $1', [result.user.id])
    expect(reactived.rows[0].active).toBe(true)
  })

  it('changes a role and its scope atomically', async () => {
    const result = await createCommandUser(superadmin, {
      name: 'Integration Role Change',
      email: `irc-${suffix}@test.local`,
      role: 'Verification Officer',
    })
    createdUsers.push(result.user.id)
    expect(result.user.scopeKind).toBe('national')

    await setUserRole(superadmin, { userId: result.user.id, role: 'Training Officer' })
    const row = await query<{ role: string; scope_kind: string }>('select role, scope_kind from users where id = $1', [
      result.user.id,
    ])
    expect(row.rows[0].role).toBe('Training Officer')
    expect(row.rows[0].scope_kind).toBe('training')

    await setUserRole(superadmin, { userId: result.user.id, role: 'Regional Coordinator', scopeZone: 'South West' })
    const zone = await query<{ scope_kind: string; scope_zone: string | null }>(
      'select scope_kind, scope_zone from users where id = $1',
      [result.user.id],
    )
    expect(zone.rows[0].scope_kind).toBe('zone')
    expect(zone.rows[0].scope_zone).toBe('South West')
  })
})

describe('outbound notifications', () => {
  it('records a truthful skipped message when no provider is configured', async () => {
    delete process.env.NOTIFY_DISABLED
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_FROM_NUMBER
    delete process.env.TWILIO_MESSAGING_SERVICE_SID
    delete process.env.META_WHATSAPP_TOKEN
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID

    const application = await makeApplication()
    await setApplicationStatus(national, { applicationId: application.id, status: 'Under Review', note: 'Notify test' })

    const rows = await query<{ status: string; channel: string; error: string | null; template: string }>(
      'select status, channel, error, template from outbound_messages where related_type = $1 and related_id = $2',
      ['application', application.id],
    )
    expect(rows.rows.length).toBeGreaterThan(0)
    for (const row of rows.rows) {
      expect(row.status).toBe('skipped')
      expect(row.error).toMatch(/No messaging provider|disabled/)
      expect(['sms', 'whatsapp']).toContain(row.channel)
      expect(['application.received', 'application.status', 'applicant.message']).toContain(row.template)
    }
  })

  it('delivers queued messages through the Twilio request path with a stubbed transport', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC-TEST'
    process.env.TWILIO_AUTH_TOKEN = 'test-token'
    process.env.TWILIO_FROM_NUMBER = '+2349000000001'
    process.env.NOTIFY_CHANNEL = 'sms'

    const inserted = await query<{ id: string }>(
      `insert into outbound_messages (channel, to_phone, template, body, related_type, related_id, status)
       values ('sms','08031250405','application.status','YEGO: test delivery','test','outbound-stub','queued') returning id`,
    )
    createdOutbound.push(inserted.rows[0].id)

    const stub = (async (url: unknown, init?: unknown) => {
      expect(String(url)).toContain('api.twilio.com')
      expect(init).toBeTruthy()
      return {
        ok: true,
        status: 201,
        json: async () => ({ sid: 'SM-TEST-123' }),
      } as unknown as Response
    }) as unknown as typeof globalThis.fetch

    const result = await processPendingMessages(5, stub)
    expect(result.sent).toBeGreaterThanOrEqual(1)

    const row = await query<{ status: string; provider_message_id: string | null }>(
      'select status, provider_message_id from outbound_messages where id = $1',
      [inserted.rows[0].id],
    )
    expect(row.rows[0].status).toBe('sent')
    expect(row.rows[0].provider_message_id).toBe('SM-TEST-123')

    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_FROM_NUMBER
    delete process.env.NOTIFY_CHANNEL
  })

  it('marks failed provider calls as failed with the provider error', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC-TEST'
    process.env.TWILIO_AUTH_TOKEN = 'test-token'
    process.env.TWILIO_FROM_NUMBER = '+2349000000001'
    process.env.NOTIFY_CHANNEL = 'sms'

    const inserted = await query<{ id: string }>(
      `insert into outbound_messages (channel, to_phone, template, body, related_type, related_id, status)
       values ('sms','08031250405','applicant.message','YEGO: failing delivery','test','outbound-fail','queued') returning id`,
    )
    createdOutbound.push(inserted.rows[0].id)

    const stub = (async () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid phone number' }),
    })) as unknown as typeof globalThis.fetch

    await processPendingMessages(5, stub)
    const row = await query<{ status: string; error: string | null }>(
      'select status, error from outbound_messages where id = $1',
      [inserted.rows[0].id],
    )
    expect(row.rows[0].status).toBe('failed')
    expect(row.rows[0].error).toBe('Invalid phone number')

    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_FROM_NUMBER
    delete process.env.NOTIFY_CHANNEL
  })
})
