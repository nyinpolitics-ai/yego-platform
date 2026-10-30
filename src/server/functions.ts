import { createServerFn } from '@tanstack/react-start'
import { getRequest, getRequestHeaders, getRequestIP } from '@tanstack/react-start/server'

import { assertSameOrigin, currentUser, loginCommand, loginGuard, logout, setGuardPassword } from './auth.server'
import {
  addIncidentNote,
  assignPollingUnit,
  bootstrap,
  checkIn,
  confirmWhatsApp,
  createApplication,
  createCommandUser,
  createEvidenceUpload,
  discardEvidenceUpload,
  exportTrainingRosterCsv,
  getCoverage,
  getDashboardStats,
  getEvidenceViewUrl,
  getNotifications,
  getTrainingRosterPage,
  listApplications,
  listCommandUsers,
  listPollingUnits,
  messageApplicant,
  lookupApplication,
  markNotificationsRead,
  postAnnouncement,
  publishWarning,
  raiseWarning,
  referIncident,
  reportIncidentByCommand,
  resendVerificationEmail,
  resolveWarning,
  setApplicationStatus,
  setIncidentStatus,
  setWarningLevel,
  setUserActive,
  setUserRole,
  serveEvidenceFile,
  uploadEvidenceChunk,
  submitIncident,
  submitTrainingQuiz,
  updateTrainingProgress,
  verifyEmailByToken,
} from './repo.server'
import * as v from './validation.server'
import { performSetup, setupStatus, type SetupInput, type SetupResult, type SetupStatus } from './setup.server'
export type { SetupInput, SetupResult, SetupStatus } from './setup.server'

/** Snapshot of database readiness, used by the /setup bootstrap wizard. */
export const getSetupStatusFn = createServerFn({ method: 'GET' }).handler(async (): Promise<SetupStatus> => {
  return setupStatus()
})

/** One-shot bootstrap: migrations + optional demo data + first Super Administrator. */
export const runSetupFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input as SetupInput)
  .handler(async ({ data }): Promise<SetupResult> => {
    await assertSameOrigin()
    return performSetup(data)
  })


export const getBootstrapFn = createServerFn({ method: 'GET' }).handler(async () => {
  return bootstrap(await currentUser())
})

export const loginCommandFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.loginCommandInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    return loginCommand(data)
  })

export const loginGuardFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.loginGuardInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    return loginGuard(data)
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  assertSameOrigin()
  await logout()
  return { ok: true }
})

export const submitApplicationFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.applicationInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    return createApplication(data as unknown as Record<string, unknown>)
  })

/** Request a fresh verification email when the original link expired or never arrived. */
export const resendVerificationEmailFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.resendVerificationInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const ip = (() => {
      try {
        return getRequestIP() ?? null
      } catch {
        return null
      }
    })()
    return resendVerificationEmail(data.applicationId, data.email, ip)
  })

/** First-sign-in step: replace the initial phone-number password with a real one. */
export const setGuardPasswordFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.setGuardPasswordInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    return setGuardPassword(data)
  })

export const lookupApplicationFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.lookupInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const ip = (() => {
      try {
        return getRequestIP() ?? null
      } catch {
        return null
      }
    })()
    return lookupApplication(data.applicationId, data.phone, ip)
  })

export const confirmWhatsAppFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.confirmWhatsAppInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    return confirmWhatsApp(data.applicationId, data.phone)
  })

/** Public endpoint behind the one-time email verification link. */
export const verifyEmailFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.verifyEmailInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    return verifyEmailByToken(data.token)
  })

export const submitIncidentFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.incidentInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return submitIncident(user, data as unknown as Record<string, unknown>)
  })

export const setIncidentStatusFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.incidentStatusInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return setIncidentStatus(user, data)
  })

export const addIncidentNoteFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.incidentNoteInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return addIncidentNote(user, data)
  })

export const referIncidentFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.referralInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return referIncident(user, data)
  })

export const setApplicationStatusFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.applicationStatusInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return setApplicationStatus(user, data)
  })

export const assignPollingUnitFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.assignPollingUnitInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return assignPollingUnit(user, data)
  })

export const submitTrainingQuizFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.trainingQuizInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return submitTrainingQuiz(user, data)
  })

export const raiseWarningFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.warningInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return raiseWarning(user, data)
  })

export const postAnnouncementFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.announcementInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return postAnnouncement(user, data as { kind: string; title: string; body: string; audience?: string })
  })

export const listPollingUnitsFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.pollingUnitsQuery, input))
  .handler(async ({ data }) => {
    return listPollingUnits(data.state, data.lga, data.ward)
  })

export const reportIncidentFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.commandIncidentInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return reportIncidentByCommand(user, data)
  })

export const getTrainingRosterPageFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.trainingRosterQuery, input))
  .handler(async ({ data }) => {
    const user = await currentUser()
    if (!user) {
      return { rows: [], total: 0, page: 1, pageSize: data.pageSize, pageCount: 1, stats: { applicants: 0, notStarted: 0, inProgress: 0, completed: 0, certified: 0, averageScore: null } }
    }
    return getTrainingRosterPage(user, data)
  })

export const exportTrainingRosterFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.trainingRosterExportQuery, input))
  .handler(async ({ data }) => {
    const user = await currentUser()
    if (!user) return { csv: '' }
    return { csv: await exportTrainingRosterCsv(user, data.q) }
  })

/** Paginated applicant list for the command applicants dashboard. */
export const listApplicationsFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.applicationListQuery, input))
  .handler(async ({ data }) => {
    const user = await currentUser()
    if (!user) return { rows: [], total: 0, page: 1, pageSize: data.pageSize, pageCount: 1 }
    return listApplications(user, data)
  })

/** Database-backed dashboard aggregates (scope + optional state/LGA filters). */
export const getDashboardStatsFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.dashboardStatsQuery, input))
  .handler(async ({ data }) => {
    const user = await currentUser()
    if (!user) return null
    return getDashboardStats(user, data)
  })

export const setTrainingProgressFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.trainingProgressInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return updateTrainingProgress(user, data)
  })

export const messageApplicantFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.messageApplicantInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return messageApplicant(user, data)
  })

export const getNotificationsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await currentUser()
  if (!user) return []
  return getNotifications(user)
})

export const markNotificationsReadFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.notificationsReadInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return markNotificationsRead(user, data.ids)
  })

export const checkInFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.checkInInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return checkIn(user, data.lat, data.lng)
  })

/* Early-warning board ------------------------------------------------------- */

export const setWarningLevelFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.warningLevelInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    await setWarningLevel(user, data)
    return { ok: true }
  })

export const resolveWarningFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.warningResolveInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    await resolveWarning(user, data)
    return { ok: true }
  })

export const publishWarningFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.warningPublishInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    await publishWarning(user, data)
    return { ok: true }
  })

/* Coverage & duty ----------------------------------------------------------- */

export const getCoverageFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await currentUser()
  if (!user) return { rows: [], duty: [], registerImported: false, generatedAt: new Date(0).toISOString() }
  return getCoverage(user)
})

/* Roles & access ------------------------------------------------------------ */

export const listCommandUsersFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await currentUser()
  if (!user) return []
  return listCommandUsers(user)
})

export const createCommandUserFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.createCommandUserInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return createCommandUser(user, data)
  })

export const setUserActiveFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.setUserActiveInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    await setUserActive(user, data)
    return { ok: true }
  })

export const setUserRoleFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.setUserRoleInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return setUserRole(user, data)
  })

/* Incident evidence ----------------------------------------------------------- */

/** Reserve an upload slot for one image/video/document (returns a signed ticket). */
export const createEvidenceUploadFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.evidenceUploadInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return createEvidenceUpload(user, data)
  })

/** Upload one chunk (<= 3 MiB raw bytes, base64-encoded) of a reserved slot. */
export const uploadEvidenceChunkFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.evidenceChunkInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return uploadEvidenceChunk(user, data)
  })

/** Remove a reserved upload slot that the user decided not to attach. */
export const discardEvidenceUploadFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.evidenceDiscardInput, input))
  .handler(async ({ data }) => {
    assertSameOrigin()
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return discardEvidenceUpload(user, data)
  })

/** Short-lived signed view token for one evidence item (authorization enforced). */
export const getEvidenceViewUrlFn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => v.parse(v.evidenceViewInput, input))
  .handler(async ({ data }) => {
    const user = await currentUser()
    if (!user) throw new Error('Sign in to continue.')
    return getEvidenceViewUrl(user, data)
  })

/**
 * Streams evidence bytes for an <img>/<video>/download link. Zero-argument GET
 * server function: the browser hits its URL directly, so authorization runs on
 * every request (session cookie + signed, short-lived query token + scope).
 * The client composes the URL from this proxy's own `.url` plus the token.
 */
export const getEvidenceFileFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await currentUser()
  const request = getRequest()
  const url = new URL(request.url)
  const rangeHeader = (() => {
    try {
      return getRequestHeaders().get('range')
    } catch {
      return null
    }
  })()
  return serveEvidenceFile(user, {
    id: url.searchParams.get('id') ?? undefined,
    exp: url.searchParams.get('exp') ?? undefined,
    sig: url.searchParams.get('sig') ?? undefined,
    rangeHeader,
  })
})
