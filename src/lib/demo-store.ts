// Server-backed application store.
//
// The UI still reads through useDB(), but every record now comes from the
// PostgreSQL database via TanStack Start server functions. There is no
// localStorage fallback: if the database is unavailable the UI reports it.
import { useEffect, useSyncExternalStore } from 'react'

import type {
  Application,
  ApplicationStatus,
  Announcement,
  EarlyWarning,
  Incident,
  IncidentStatus,
  Severity,
} from './fixtures'
import {
  addIncidentNoteFn,
  assignPollingUnitFn,
  checkInFn,
  confirmWhatsAppFn,
  createCommandUserFn,
  getBootstrapFn,
  getCoverageFn,
  getNotificationsFn,
  getTrainingRosterFn,
  listCommandUsersFn,
  messageApplicantFn,
  publishWarningFn,
  raiseWarningFn,
  referIncidentFn,
  reportIncidentFn,
  resolveWarningFn,
  setTrainingProgressFn,
  setUserActiveFn,
  setUserRoleFn,
  setWarningLevelFn,
  listPollingUnitsFn,
  loginCommandFn,
  loginGuardFn,
  logoutFn,
  lookupApplicationFn,
  markNotificationsReadFn,
  postAnnouncementFn,
  setApplicationStatusFn,
  setIncidentStatusFn,
  submitApplicationFn,
  submitIncidentFn,
  submitTrainingQuizFn,
} from '@/server/functions'

export interface Session {
  name: string
  email: string
  role: string
  scope: string
  kind: 'command' | 'guard'
  applicationId?: string
}

export interface AppNotification {
  id: string
  kind: string
  title: string
  body: string
  entityType: string | null
  entityId: string | null
  read: boolean
  createdAt: string
}

export interface DB {
  session: Session | null
  applications: Application[]
  incidents: Incident[]
  warnings: EarlyWarning[]
  announcements: Announcement[]
  notifications: AppNotification[]
  lastCheckInAt?: string
  ready: boolean
  error: string | null
}

const EMPTY: DB = {
  session: null,
  applications: [],
  incidents: [],
  warnings: [],
  announcements: [],
  notifications: [],
  ready: false,
  error: null,
}

let state: DB = EMPTY
let boot: Promise<void> | null = null
const listeners = new Set<() => void>()

function commit(next: DB) {
  state = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot() {
  return state
}

function serverSnapshot() {
  return EMPTY
}

export function useDB(): DB {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  useEffect(() => {
    void ensureBootstrap()
  }, [])
  return value
}

export async function ensureBootstrap(): Promise<void> {
  if (state.ready) return
  if (!boot) {
    boot = getBootstrapFn()
      .then((data) => {
        commit({ ...data, notifications: data.notifications as AppNotification[], ready: true, error: null })
      })
      .catch((error: unknown) => {
        commit({ ...EMPTY, ready: true, error: errorMessage(error) })
      })
      .finally(() => {
        boot = null
      })
  }
  return boot
}

export async function refresh(): Promise<void> {
  try {
    const data = await getBootstrapFn()
    commit({ ...data, notifications: data.notifications as AppNotification[], ready: true, error: null })
  } catch (error) {
    commit({ ...state, ready: true, error: errorMessage(error) })
  }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
    return 'The database is unavailable. Check DATABASE_URL and run `pnpm db:migrate`.'
  }
  return message
}

/* Auth -------------------------------------------------------------------- */

export async function signIn(email: string, password: string): Promise<Session> {
  const session = await loginCommandFn({ data: { email, password } })
  await refresh()
  return session
}

export async function signInApplicant(applicationId: string, phone: string): Promise<Session> {
  const session = await loginGuardFn({ data: { applicationId, phone } })
  await refresh()
  return session
}

export async function signOut(): Promise<void> {
  await logoutFn()
  commit({ ...EMPTY, ready: true })
}

/* Applications ------------------------------------------------------------ */

export interface NewApplication {
  fullName: string
  gender: 'Female' | 'Male'
  dateOfBirth: string
  phone: string
  whatsapp: string
  nin: string
  email: string
  stateOfOrigin: string
  stateOfResidence: string
  lga: string
  ward: string
  pollingUnit?: string
  background: string
  experience: string
  photo: string
  nonPartisan: true
  codeOfConduct: true
  dataConsent: true
}

export async function submitApplication(input: NewApplication): Promise<Application> {
  const application = await submitApplicationFn({ data: input })
  await refresh()
  return application
}

export async function confirmWhatsApp(applicationId: string, phone: string): Promise<void> {
  await confirmWhatsAppFn({ data: { applicationId, phone } })
  await refresh()
}

export async function lookupApplication(applicationId: string, phone: string): Promise<Application> {
  return lookupApplicationFn({ data: { applicationId, phone } })
}

export async function setApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
  note?: string,
): Promise<void> {
  await setApplicationStatusFn({ data: { applicationId, status, note } })
  await refresh()
}

export async function assignPollingUnit(
  applicationId: string,
  ward: string,
  pollingUnit: string,
): Promise<void> {
  await assignPollingUnitFn({ data: { applicationId, ward, pollingUnit } })
  await refresh()
}

/* Incidents --------------------------------------------------------------- */

export interface NewIncident {
  type: string
  description: string
  severity: Severity
  lat: number
  lng: number
  occurredAt: string
  evidence: { kind: 'photo' | 'video' | 'document'; name: string }[]
  electionDay: boolean
}

export async function submitIncident(input: NewIncident): Promise<Incident> {
  const incident = await submitIncidentFn({ data: input })
  await refresh()
  return incident
}

export async function setIncidentStatus(
  incidentId: string,
  status: IncidentStatus,
  note?: string,
  category?: string,
): Promise<void> {
  await setIncidentStatusFn({ data: { incidentId, status, note, category } })
  await refresh()
}

export async function addIncidentNote(incidentId: string, action: string, note: string): Promise<void> {
  await addIncidentNoteFn({ data: { incidentId, action, note } })
  await refresh()
}

export async function referIncident(incidentId: string, agencies: string[], note?: string): Promise<void> {
  await referIncidentFn({ data: { incidentId, agencies, note } })
  await refresh()
}

/* Early warning, training, messaging -------------------------------------- */

export async function raiseWarning(input: {
  type: string
  title: string
  summary: string
  evidenceCount?: number
}): Promise<void> {
  await raiseWarningFn({
    data: {
      type: input.type,
      title: input.title,
      summary: input.summary,
      evidenceCount: input.evidenceCount ?? 0,
    },
  })
  await refresh()
}

export async function submitTrainingQuiz(
  moduleId: string,
  answers: number[],
): Promise<{ passed: boolean; progress: number; status: ApplicationStatus }> {
  const result = await submitTrainingQuizFn({ data: { moduleId, answers } })
  await refresh()
  return result
}

export async function postAnnouncement(input: {
  kind: 'Announcement' | 'Operational instruction' | 'Alert' | 'Training' | 'Emergency'
  title: string
  body: string
  audience?: string
}): Promise<void> {
  await postAnnouncementFn({ data: input })
  await refresh()
}

export async function checkIn(lat?: number, lng?: number): Promise<void> {
  await checkInFn({ data: { lat, lng } })
  await refresh()
}

export async function listPollingUnits(state: string, lga: string, ward: string) {
  return listPollingUnitsFn({ data: { state, lga, ward } })
}

/* Command reporting, applicant messaging and training administration ------- */

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

export async function reportIncident(input: {
  state: string
  lga: string
  ward: string
  pollingUnit?: string
  type: string
  severity: Severity
  description: string
  occurredAt: string
  electionDay: boolean
}): Promise<Incident> {
  const incident = await reportIncidentFn({ data: input })
  await refresh()
  return incident
}

export async function getTrainingRoster(): Promise<TrainingRosterRow[]> {
  return getTrainingRosterFn()
}

export async function setTrainingProgress(applicationId: string, progress: number, note?: string) {
  const result = await setTrainingProgressFn({ data: { applicationId, progress, note } })
  await refresh()
  return result
}

export async function messageApplicant(applicationId: string, body: string, title?: string) {
  await messageApplicantFn({ data: { applicationId, body, title } })
  await refresh()
}

/* Early-warning board ------------------------------------------------------- */

export async function setWarningLevel(warningId: string, level: 'Watch' | 'Alert' | 'Urgent', note?: string) {
  await setWarningLevelFn({ data: { warningId, level, note } })
  await refresh()
}

export async function resolveWarning(warningId: string, note?: string) {
  await resolveWarningFn({ data: { warningId, note } })
  await refresh()
}

export async function publishWarning(warningId: string, access: 'Command only' | 'State coordinators' | 'All Guards in area') {
  await publishWarningFn({ data: { warningId, access } })
  await refresh()
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

export async function getCoverage(): Promise<CoverageData> {
  return getCoverageFn()
}

/* Roles & access ------------------------------------------------------------ */

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

export async function listCommandUsers(): Promise<CommandUserRow[]> {
  return listCommandUsersFn()
}

export async function createCommandUser(input: {
  email: string
  name: string
  role: string
  scopeZone?: string
  scopeState?: string
  scopeLga?: string
  password?: string
}): Promise<{ user: CommandUserRow; generatedPassword?: string }> {
  const result = await createCommandUserFn({ data: input })
  await refresh()
  return result
}

export async function setUserActive(userId: string, active: boolean) {
  await setUserActiveFn({ data: { userId, active } })
  await refresh()
}

export async function setUserRole(
  userId: string,
  role: string,
  scope?: { scopeZone?: string; scopeState?: string; scopeLga?: string },
) {
  await setUserRoleFn({ data: { userId, role, ...scope } })
  await refresh()
}

/* Notifications ----------------------------------------------------------- */

export async function refreshNotifications(): Promise<void> {
  const notifications = await getNotificationsFn()
  commit({ ...state, notifications: notifications as AppNotification[] })
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return
  await markNotificationsReadFn({ data: { ids } })
  commit({
    ...state,
    notifications: state.notifications.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)),
  })
}
