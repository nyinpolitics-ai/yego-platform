import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'

import { assertSameOrigin, currentUser, loginCommand, loginGuard, logout, setGuardPassword } from './auth.server'
import {
  addIncidentNote,
  assignPollingUnit,
  bootstrap,
  checkIn,
  confirmWhatsApp,
  createApplication,
  createCommandUser,
  getCoverage,
  getNotifications,
  getTrainingRoster,
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

export const getTrainingRosterFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await currentUser()
  if (!user) return []
  return getTrainingRoster(user)
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
