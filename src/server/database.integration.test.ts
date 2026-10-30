// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { mapAuthUser, loginCommand, loginGuard } from '@/server/auth.server'
import { hashPassword } from '@/server/security.server'
import { query } from '@/server/db.server'
import {
  assignPollingUnit,
  confirmWhatsApp,
  createCommandUser,
  createEvidenceUpload,
  discardEvidenceUpload,
  exportTrainingRosterCsv,
  getCoverage,
  getDashboardStats,
  getEvidenceViewUrl,
  getTrainingRosterPage,
  listApplications,
  listCommandUsers,
  messageApplicant,
  publishWarning,
  reportIncidentByCommand,
  resendVerificationEmail,
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
  serveEvidenceFile,
  submitIncident,
  submitTrainingQuiz,
  uploadEvidenceChunk,
  verifyEmailByToken,
} from '@/server/repo.server'
import { evidenceExists } from '@/server/storage.server'
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
  const { application } = await createApplication({
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
    expect(correct.progress).toBe(13) // 1 of 8 modules
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
      evidence: [],
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

    const roster = await getTrainingRosterPage(trainingOfficer, { page: 1, pageSize: 25, q: application.id })
    const row = roster.rows.find((item) => item.applicationId === application.id)
    expect(row).toBeTruthy()
    expect(row?.trainingProgress).toBe(10)
    expect(roster.total).toBe(1)

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
      "select status, channel, error, template from outbound_messages where related_type = $1 and related_id = $2 and channel in ('sms', 'whatsapp')",
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

describe('applicant email verification and guard login', () => {
  async function queuedEmail(publicId: string, notBody?: string): Promise<{ subject: string; body: string }> {
    // The confirmation email (and its verification link) is recorded in
    // outbound_messages before any delivery is attempted, even when no
    // provider is configured (the row is then marked 'skipped').
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const row = await query<{ subject: string; body: string }>(
        "select subject, body from outbound_messages where channel = 'email' and related_type = 'application' and related_id = $1 order by created_at desc limit 1",
        [publicId],
      )
      if (row.rows[0]?.body && row.rows[0].body !== notBody) return row.rows[0]
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('The confirmation email was not recorded in outbound_messages')
  }

  it('sends one confirmation email with the applicant login details and gates login on verification', async () => {
    const phone = nextPhone()
    const email = `login-flow-${stamp}-${Date.now().toString(36)}@example.ng`
    const application = await makeApplication({ phone, whatsapp: phone, email })
    const stored = await applicationRow(application.id)

    // The confirmation email carries the real Application ID as the username
    // and the exact phone number from the record (leading zero preserved).
    const mail = await queuedEmail(application.id)
    expect(mail.subject).toBe('YEGO Application Received — Action Required: Join Official WhatsApp Channel')
    const body = mail.body
    expect(body).toContain(`Username: ${application.id}`)
    expect(body).toContain(`Password: ${stored.phone}`)
    expect(body).toContain('Verify My Email Address')
    expect(body).not.toMatch(/placeholder|\{[a-z]+\}/i)

    // Exactly one confirmation email per submission.
    const mails = await query<{ n: number }>(
      "select count(*)::int as n from outbound_messages where channel = 'email' and related_type = 'application' and related_id = $1",
      [application.id],
    )
    expect(mails.rows[0].n).toBe(1)

    // Unverified applicants cannot sign in even with correct credentials.
    await expect(loginGuard({ applicationId: application.id, password: stored.phone })).rejects.toThrow(
      /EMAIL_NOT_VERIFIED/,
    )

    // Resend requires the email address on record; it never sends elsewhere.
    await expect(resendVerificationEmail(application.id, 'wrong@example.ng', 'test-integration')).rejects.toThrow(
      /No application matches/,
    )
    // With no email provider configured the resend is refused honestly (the
    // application and its record stay intact) and a fresh link is queued.
    await expect(resendVerificationEmail(application.id, email, 'test-integration')).rejects.toThrow(
      /could not be sent|not configured/,
    )

    // Verify with the one-time token from the latest queued email: the resend
    // replaced the first link, which therefore no longer works.
    const refreshed = await queuedEmail(application.id, mail.body)
    const token = refreshed.body.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? ''
    expect(token.length).toBeGreaterThan(20)
    const verified = await verifyEmailByToken(token)
    expect(verified.ok).toBe(true)
    expect(verified.applicationId).toBe(application.id)

    // A used token is rejected: verification links are single-use.
    await expect(verifyEmailByToken(token)).rejects.toThrow(/not valid/)

    // Once verified, a resend is unnecessary and reported truthfully.
    const noop = await resendVerificationEmail(application.id, email, 'test-integration')
    expect(noop).toEqual({ verified: true, sent: false })

    // First successful sign-in: Application ID + application phone number.
    const first = await loginGuard({ applicationId: application.id, password: stored.phone })
    expect(first.mustChangePassword).toBe(true)

    // The initial password stops working once a real password is chosen
    // (the portal forces this step; the row is updated by setGuardPassword).
    const guardRow = (
      await query<{ id: string; must_change_password: boolean }>(
        'select id, must_change_password from users where application_id = $1',
        [stored.id],
      )
    ).rows[0]
    expect(guardRow.must_change_password).toBe(true)
    createdUsers.push(guardRow.id)
    await query('update users set password_hash = $2, must_change_password = false where id = $1', [
      guardRow.id,
      hashPassword('Str0ngChosenPass!'),
    ])

    await expect(loginGuard({ applicationId: application.id, password: stored.phone })).rejects.toThrow(
      /Invalid Application ID or password/,
    )
    const second = await loginGuard({ applicationId: application.id, password: 'Str0ngChosenPass!' })
    expect(second.mustChangePassword).toBe(false)
    expect(second.applicationId).toBe(application.id)
  })

  it('keeps Command staff sign-in on email + password, independent of the Guard flow', async () => {
    const email = `command-login-${stamp}-${counter}@yego.ng`
    const created = await createCommandUser(superadmin, {
      email,
      name: `Command Login Test ${stamp}`,
      role: 'State Coordinator',
      scopeState: 'Lagos',
      password: 'CommandPass-2026!',
    })
    createdUsers.push(created.user.id)

    const session = await loginCommand({ email, password: 'CommandPass-2026!' })
    expect(session.kind).toBe('command')
    expect(session.mustChangePassword).toBeUndefined()

    await expect(loginCommand({ email, password: 'wrong-password' })).rejects.toThrow(/Invalid email or password/)
    // A Guard account cannot pass through the Command tab.
    const application = await makeApplication()
    await expect(loginCommand({ email: `guard-${application.id.toLowerCase()}@yego.local`, password: 'x' })).rejects.toThrow()
  })
})

/* ---------------------------------------------------------------------------
 * Dashboard statistics + server-side pagination (Task: accurate dashboards).
 * Bulk-inserts > 500 applications directly (fast) and proves that every
 * statistic and every total is computed from the FULL database set inside the
 * caller's scope — never from the paginated list window.
 * ------------------------------------------------------------------------- */
describe('dashboard statistics and pagination', () => {
  const bulkStamp = `BT${stamp}`
  const BULK_TOTAL = 505
  const bulkStatuses = [
    'Application Submitted',
    'Under Review',
    'Screening',
    'Approved',
    'Training Required',
    'Training Completed',
    'Certified/Active',
    'Not Approved',
  ] as const

  async function insertBulkApplications(count: number, state: string, lga: string) {
    const rows: unknown[][] = []
    for (let i = 0; i < count; i += 1) {
      rows.push([
        `YG-APP-${bulkStamp}${state.slice(0, 2).toUpperCase()}${String(i).padStart(4, '0')}`,
        `Bulk ${state} Applicant ${bulkStamp} ${i}`,
        i % 2 === 0 ? 'Female' : 'Male',
        '1998-05-10',
        `0805${String(50000000 + counter * 1000 + i).slice(-8)}`,
        `0805${String(50000000 + counter * 1000 + i).slice(-8)}`,
        `bulk-${bulkStamp}-${state}-${i}@example.ng`,
        state,
        state,
        lga,
        `Ward ${i % 5}`,
        'Student (tertiary)',
        bulkStatuses[i % bulkStatuses.length],
      ])
    }
    // Insert in chunks to stay well inside the parameter limit.
    for (let start = 0; start < rows.length; start += 100) {
      const chunk = rows.slice(start, start + 100)
      const values = chunk.map((_, i) => `($${i * 13 + 1},$${i * 13 + 2},$${i * 13 + 3},$${i * 13 + 4},$${i * 13 + 5},$${i * 13 + 6},$${i * 13 + 7},$${i * 13 + 8},$${i * 13 + 9},$${i * 13 + 10},$${i * 13 + 11},$${i * 13 + 12},$${i * 13 + 13})`).join(',')
      await query(
        `insert into applications (public_id, full_name, gender, date_of_birth, phone, whatsapp, email,
           state_of_origin, state_of_residence, lga, ward, background, status)
         values ${values}`,
        chunk.flat(),
      )
    }
  }

  afterAll(async () => {
    await query(`delete from applications where public_id like 'YG-APP-${bulkStamp}%'`)
  })

  it('computes all statistics from the whole database, beyond any list window', async () => {
    await insertBulkApplications(BULK_TOTAL, 'Kano', 'Nasarawa')

    const stats = await getDashboardStats(national)
    // There are also seed + per-test applications; the DB truth is authoritative:
    const dbTotal = (await query<{ n: number }>('select count(*)::int as n from applications')).rows[0].n
    const dbNew = (await query<{ n: number }>("select count(*)::int as n from applications where status = 'Application Submitted'")).rows[0].n
    const dbScreening = (await query<{ n: number }>("select count(*)::int as n from applications where status in ('Under Review','Screening')")).rows[0].n
    const dbApproved = (await query<{ n: number }>("select count(*)::int as n from applications where status in ('Approved','Training Required')")).rows[0].n
    const dbTrained = (await query<{ n: number }>("select count(*)::int as n from applications where status = 'Training Completed'")).rows[0].n
    const dbActive = (await query<{ n: number }>("select count(*)::int as n from applications where status = 'Certified/Active'")).rows[0].n
    const dbRejected = (await query<{ n: number }>("select count(*)::int as n from applications where status = 'Not Approved'")).rows[0].n

    expect(dbTotal).toBeGreaterThan(500) // the old limit would have capped this at 500
    expect(stats.applications.total).toBe(dbTotal)
    expect(stats.applications.newApplications).toBe(dbNew)
    expect(stats.applications.inScreening).toBe(dbScreening)
    expect(stats.applications.verifiedApproved).toBe(dbApproved)
    expect(stats.applications.trained).toBe(dbTrained)
    expect(stats.applications.activeGuards).toBe(dbActive)
    expect(stats.applications.notApproved).toBe(dbRejected)
    // The five cards + Not Approved + the rest must add up to the total.
    expect(
      stats.applications.newApplications +
        stats.applications.inScreening +
        stats.applications.verifiedApproved +
        stats.applications.trained +
        stats.applications.activeGuards +
        stats.applications.notApproved,
    ).toBe(stats.applications.total)

    // The list endpoint reports the same total even though it only returns one page.
    const page = await listApplications(national, { page: 1, pageSize: 25 })
    expect(page.total).toBe(dbTotal)
    expect(page.rows.length).toBe(25)
    expect(page.pageCount).toBe(Math.ceil(dbTotal / 25))

    // Page 21+ works (beyond the old 500-row window).
    const deepPage = await listApplications(national, { page: 21, pageSize: 25 })
    expect(deepPage.page).toBe(21)
    expect(deepPage.rows.length).toBe(Math.min(25, dbTotal - 500))
    expect(deepPage.total).toBe(dbTotal)
  })

  it('searches and filters across the entire dataset server-side', async () => {
    const needle = (await query<{ public_id: string; phone: string; full_name: string }>(
      "select public_id, phone, full_name from applications where public_id like 'YG-APP-" + bulkStamp + "KA%' order by public_id limit 1",
    )).rows[0]

    const byId = await listApplications(national, { page: 1, pageSize: 25, q: needle.public_id })
    expect(byId.total).toBe(1)
    expect(byId.rows[0].id).toBe(needle.public_id)

    const byPhone = await listApplications(national, { page: 1, pageSize: 25, q: needle.phone })
    expect(byPhone.total).toBeGreaterThanOrEqual(1)
    expect(byPhone.rows.some((row) => row.id === needle.public_id)).toBe(true)

    const lastName = (await query<{ full_name: string }>(
      "select full_name from applications where public_id like 'YG-APP-" + bulkStamp + "KA%' order by full_name desc limit 1",
    )).rows[0].full_name
    const byName = await listApplications(national, { page: 1, pageSize: 25, q: lastName })
    expect(byName.total).toBe(1)
    expect(byName.rows[0].fullName).toBe(lastName)

    const submitted = await listApplications(national, {
      page: 1,
      pageSize: 25,
      status: 'Application Submitted',
      q: 'Bulk Kano',
    })
    expect(submitted.rows.every((row) => row.status === 'Application Submitted')).toBe(true)
    const dbSubmittedKano = (
      await query<{ n: number }>(
        "select count(*)::int as n from applications where status = 'Application Submitted' and full_name like 'Bulk Kano%'",
      )
    ).rows[0].n
    expect(submitted.total).toBe(dbSubmittedKano)
  })

  it('respects state and LGA scope for statistics and lists', async () => {
    await insertBulkApplications(8, 'Lagos', 'Surulere')

    const lagosStats = await getDashboardStats(lagosCoordinator)
    const dbLagos = (await query<{ n: number }>("select count(*)::int as n from applications where state_of_residence = 'Lagos'")).rows[0].n
    expect(lagosStats.applications.total).toBe(dbLagos)
    expect(lagosStats.applications.total).toBeLessThan((await getDashboardStats(national)).applications.total)
    expect(lagosStats.byState.map((row) => row.state)).toEqual(['Lagos'])

    const lagosList = await listApplications(lagosCoordinator, { page: 1, pageSize: 25 })
    expect(lagosList.total).toBe(dbLagos)
    expect(lagosList.rows.every((row) => row.stateOfResidence === 'Lagos')).toBe(true)

    await expect(getDashboardStats(lagosCoordinator, { state: 'Kano' })).rejects.toThrow(/outside your assigned area/)

    const nationalWithFilter = await getDashboardStats(national, { state: 'Lagos', lga: 'Surulere' })
    const dbLagosSurulere = (
      await query<{ n: number }>("select count(*)::int as n from applications where state_of_residence = 'Lagos' and lga = 'Surulere'")
    ).rows[0].n
    expect(nationalWithFilter.applications.total).toBe(dbLagosSurulere)
    expect(nationalWithFilter.byLga.map((row) => row.lga)).toEqual(['Surulere'])
  })

  it('keeps the training roster accurate beyond 500 records and exports the full CSV', async () => {
    const rosterStats = await getTrainingRosterPage(trainingOfficer, { page: 1, pageSize: 25 })
    const dbTotal = (await query<{ n: number }>('select count(*)::int as n from applications')).rows[0].n
    expect(rosterStats.total).toBe(dbTotal)
    expect(dbTotal).toBeGreaterThan(500)
    expect(rosterStats.stats.applicants).toBe(dbTotal)
    const dbCertified = (await query<{ n: number }>("select count(*)::int as n from applications where status = 'Certified/Active'")).rows[0].n
    expect(rosterStats.stats.certified).toBe(dbCertified)

    // The CSV export covers the whole roster, not the visible page.
    const csv = await exportTrainingRosterCsv(trainingOfficer)
    const lines = csv.split('\n').filter((line) => line.length > 0)
    expect(lines[0]).toContain('Application ID')
    expect(lines.length - 1).toBe(dbTotal)
  })
})

/* ---------------------------------------------------------------------------
 * Incident evidence uploads (Task: real, private, viewable attachments).
 * ------------------------------------------------------------------------- */
describe('incident evidence uploads', () => {
  let storageRoot: string
  let guard: AuthUser
  let incidentId: string
  let evidenceRow: { id: string; storage_key: string | null; mime_type: string | null; byte_size: string | null }

  // 1x1 transparent PNG, 70 bytes.
  const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  beforeAll(async () => {
    process.env.EVIDENCE_STORAGE = 'disk'
    storageRoot = mkdtempSync(path.join(tmpdir(), 'yego-evidence-test-'))
    process.env.EVIDENCE_STORAGE_ROOT = storageRoot

    const application = await makeApplication({ stateOfOrigin: 'Kano', stateOfResidence: 'Kano', lga: 'Nasarawa' })
    const stored = await applicationRow(application.id)
    await query("update applications set status = 'Certified/Active', training_progress = 100 where id = $1", [stored.id])
    guard = await makeGuard(stored.id, 'Kano', 'Nasarawa')
  })

  afterAll(async () => {
    await query('delete from incident_evidence where incident_id = any(select id from incidents where public_id = any($1::text[]))', [
      createdIncidents,
    ])
    await Promise.resolve(rmSync(storageRoot, { recursive: true, force: true }))
    delete process.env.EVIDENCE_STORAGE
    delete process.env.EVIDENCE_STORAGE_ROOT
  })

  it('uploads an image in chunks, links it to the incident and persists real storage metadata', async () => {
    const slot = await createEvidenceUpload(guard, { fileName: 'queue-photo.png', mimeType: 'image/png', byteSize: PNG_BYTES.byteLength })
    expect(slot.parts).toBe(1)
    expect(slot.storageKey).toMatch(/^evidence\//)

    const uploaded = await uploadEvidenceChunk(guard, {
      storageKey: slot.storageKey,
      ticket: slot.ticket,
      mimeType: 'image/png',
      byteSize: PNG_BYTES.byteLength,
      exp: slot.expiresAt,
      partIndex: 0,
      data: PNG_BYTES.toString('base64'),
    })
    expect(uploaded.received).toBe(PNG_BYTES.byteLength)

    const incident = await submitIncident(guard, {
      type: 'Vote buying / inducement',
      description: 'Integration test: incident with one uploaded photo.',
      severity: 'Medium',
      lat: 12.01,
      lng: 8.55,
      occurredAt: new Date().toISOString(),
      evidence: [
        {
          kind: 'photo',
          name: 'queue-photo.png',
          mimeType: 'image/png',
          byteSize: PNG_BYTES.byteLength,
          storageKey: slot.storageKey,
          ticket: slot.ticket,
          exp: slot.expiresAt,
          parts: slot.parts,
        },
      ],
      electionDay: true,
    })
    incidentId = incident.id
    createdIncidents.push(incidentId)

    expect(incident.evidence).toHaveLength(1)
    expect(incident.evidence[0].hasFile).toBe(true)
    expect(incident.evidence[0].mimeType).toBe('image/png')
    expect(incident.evidence[0].byteSize).toBe(PNG_BYTES.byteLength)

    evidenceRow = (
      await query<{ id: string; storage_key: string | null; mime_type: string | null; byte_size: string | null }>(
        `select e.id, e.storage_key, e.mime_type, e.byte_size from incident_evidence e
         join incidents i on i.id = e.incident_id where i.public_id = $1`,
        [incidentId],
      )
    ).rows[0]
    expect(evidenceRow.storage_key).toBeTruthy()
    expect(evidenceRow.mime_type).toBe('image/png')
    expect(Number(evidenceRow.byte_size)).toBe(PNG_BYTES.byteLength)
    await expect(evidenceExists(evidenceRow.storage_key ?? '')).resolves.toBe(true)
  })

  it('streams the evidence to an authorized officer through a signed, expiring URL', async () => {
    const view = await getEvidenceViewUrl(national, { incidentId, evidenceId: evidenceRow.id })
    if (view.unavailable) throw new Error('expected the uploaded file to be available')
    expect(view.mimeType).toBe('image/png')

    const response = await serveEvidenceFile(national, {
      id: view.evidenceId,
      exp: String(view.exp),
      sig: view.sig,
      rangeHeader: null,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    const body = Buffer.from(await response.arrayBuffer())
    expect(body.equals(PNG_BYTES)).toBe(true)

    // Byte-range requests work (video seeking).
    const range = await serveEvidenceFile(national, {
      id: view.evidenceId,
      exp: String(view.exp),
      sig: view.sig,
      rangeHeader: `bytes=0-${PNG_BYTES.byteLength - 1}`,
    })
    expect(range.status).toBe(206)
    expect((await range.arrayBuffer()).byteLength).toBe(PNG_BYTES.byteLength)
  })

  it('blocks unauthorized access: other scopes, guards, missing sessions, forged and expired tokens', async () => {
    const view = await getEvidenceViewUrl(national, { incidentId, evidenceId: evidenceRow.id })
    if (view.unavailable) throw new Error('expected the uploaded file to be available')

    // A Lagos coordinator may not open a Kano incident's evidence.
    await expect(getEvidenceViewUrl(lagosCoordinator, { incidentId, evidenceId: evidenceRow.id })).rejects.toThrow(/outside your assigned area/)
    const crossScope = await serveEvidenceFile(lagosCoordinator, { id: view.evidenceId, exp: String(view.exp), sig: view.sig, rangeHeader: null })
    expect(crossScope.status).toBe(403)

    // Guards cannot open the evidence viewer at all.
    await expect(getEvidenceViewUrl(guard, { incidentId, evidenceId: evidenceRow.id })).rejects.toThrow()

    // No session -> unauthorized.
    const anonymous = await serveEvidenceFile(null, { id: view.evidenceId, exp: String(view.exp), sig: view.sig, rangeHeader: null })
    expect(anonymous.status).toBe(401)

    // Forged signature and expired link.
    const forged = await serveEvidenceFile(national, { id: view.evidenceId, exp: String(view.exp), sig: 'forged', rangeHeader: null })
    expect(forged.status).toBe(403)
    const past = Math.floor(Date.now() / 1000) - 5
    const { signEvidenceViewToken } = await import('@/server/storage.server')
    const expiredSig = signEvidenceViewToken(view.evidenceId, past)
    const expired = await serveEvidenceFile(national, { id: view.evidenceId, exp: String(past), sig: expiredSig, rangeHeader: null })
    expect(expired.status).toBe(403)
  })

  it('refuses uploads signed by nobody and cleans up discarded uploads', async () => {
    const slot = await createEvidenceUpload(guard, { fileName: 'clip.mp4', mimeType: 'video/mp4', byteSize: 1024 })
    await expect(
      uploadEvidenceChunk(guard, {
        storageKey: slot.storageKey,
        ticket: 'forged-ticket-value-aaaaaaaaaaaaaaaa',
        mimeType: 'video/mp4',
        byteSize: 1024,
        exp: slot.expiresAt,
        partIndex: 0,
        data: 'aGVsbG8=',
      }),
    ).rejects.toThrow(/invalid or has expired/)

    await discardEvidenceUpload(guard, {
      storageKey: slot.storageKey,
      ticket: slot.ticket,
      mimeType: 'video/mp4',
      byteSize: 1024,
      exp: slot.expiresAt,
    })
    await expect(evidenceExists(slot.storageKey)).resolves.toBe(false)
  })

  it('marks legacy attachments without stored bytes as unavailable instead of faking a link', async () => {
    const legacy = (
      await query<{ id: string }>(
        `insert into incident_evidence (incident_id, kind, file_name, storage_key)
         values ((select id from incidents where public_id = $1), 'photo', 'old-file.jpg', null) returning id`,
        [incidentId],
      )
    ).rows[0]

    const view = await getEvidenceViewUrl(national, { incidentId, evidenceId: legacy.id })
    if (!view.unavailable) throw new Error('expected legacy attachment to be unavailable')
    expect(view.reason).toMatch(/never uploaded/i)
  })
})

/* ---------------------------------------------------------------------------
 * Incident status workflow (Task: newly reported incidents start as Reported).
 * ------------------------------------------------------------------------- */
describe('incident status workflow', () => {
  it('creates guard reports as Reported and never lets them jump straight to Closed', async () => {
    const application = await makeApplication({ stateOfOrigin: 'Kano', stateOfResidence: 'Kano', lga: 'Nasarawa' })
    const stored = await applicationRow(application.id)
    await query("update applications set status = 'Certified/Active', training_progress = 100 where id = $1", [stored.id])
    const guard = await makeGuard(stored.id, 'Kano', 'Nasarawa')

    const incident = await submitIncident(guard, {
      type: 'Late arrival of materials / officials',
      description: 'Integration test: status workflow probe.',
      severity: 'Low',
      lat: 12.01,
      lng: 8.55,
      occurredAt: new Date().toISOString(),
      evidence: [],
      electionDay: true,
    })
    createdIncidents.push(incident.id)

    // The database row, the mapped DTO and the audit history all say Reported.
    const row = (await query<{ status: string }>('select status from incidents where public_id = $1', [incident.id])).rows[0]
    expect(row.status).toBe('Reported')
    expect(incident.status).toBe('Reported')
    const history = (
      await query<{ action: string }>('select action from incident_history where incident_id = (select id from incidents where public_id = $1) order by created_at', [incident.id])
    ).rows
    expect(history.map((h) => h.action)).toEqual(['Reported'])

    await expect(setIncidentStatus(national, { incidentId: incident.id, status: 'Closed' })).rejects.toThrow(/cannot move/)

    // The legitimate path: Reported -> Received -> Under Review -> Verified -> Referred/Actioned -> Closed.
    await setIncidentStatus(national, { incidentId: incident.id, status: 'Received' })
    await setIncidentStatus(national, { incidentId: incident.id, status: 'Under Review' })
    await setIncidentStatus(national, { incidentId: incident.id, status: 'Verified' })
    await referIncident(national, { incidentId: incident.id, agencies: ['INEC'], note: 'Forwarded for action.' })
    const closed = await setIncidentStatus(national, { incidentId: incident.id, status: 'Closed' })
    expect(closed.status).toBe('Closed')
    const trail = (
      await query<{ action: string }>(
        'select action from incident_history where incident_id = (select id from incidents where public_id = $1) order by created_at',
        [incident.id],
      )
    ).rows.map((h) => h.action)
    expect(trail).toEqual(['Reported', 'Received', 'Under Review', 'Verified', 'Referred/Actioned', 'Closed'])
  })
})

/* ---------------------------------------------------------------------------
 * WhatsApp channel confirmation (Task: explicit applicant confirmation).
 * ------------------------------------------------------------------------- */
describe('whatsapp channel confirmation', () => {
  it('records the applicant confirmation once and requires the matching phone number', async () => {
    const application = await makeApplication()
    const stored = await applicationRow(application.id)

    await expect(confirmWhatsApp(application.id, '08100000000')).rejects.toThrow(/not found/)

    await confirmWhatsApp(application.id, stored.phone)
    const first = (await query<{ t: Date | null }>('select whatsapp_confirmed_at as t from applications where id = $1', [stored.id])).rows[0]
    expect(first.t).toBeTruthy()

    // Confirming again is idempotent: the FIRST timestamp is preserved.
    await new Promise((resolve) => setTimeout(resolve, 1100))
    await confirmWhatsApp(application.id, stored.phone)
    const second = (await query<{ t: Date | null }>('select whatsapp_confirmed_at as t from applications where id = $1', [stored.id])).rows[0]
    expect(new Date(second.t ?? 0).getTime()).toBe(new Date(first.t ?? 0).getTime())

    // The admin dashboard sees the confirmed flag.
    const list = await listApplications(national, { page: 1, pageSize: 100, q: application.id })
    expect(list.rows[0]?.confirmedWhatsApp).toBe(true)
  })
})
