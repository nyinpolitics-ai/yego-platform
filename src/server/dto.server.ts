import type {
  Announcement,
  Application,
  ApplicationStatus,
  AuditEntry,
  EarlyWarning,
  Incident,
  IncidentStatus,
  Severity,
} from '@/lib/fixtures'

export interface NotificationDto {
  id: string
  kind: string
  title: string
  body: string
  entityType: string | null
  entityId: string | null
  read: boolean
  createdAt: string
}

export interface SessionDto {
  name: string
  email: string
  role: string
  scope: string
  kind: 'command' | 'guard'
  applicationId?: string
}

export interface ApplicationRow {
  id: string
  public_id: string
  yego_id: string | null
  full_name: string
  gender: 'Female' | 'Male'
  date_of_birth: string | Date
  phone: string
  whatsapp: string
  email: string
  nin_last4: string | null
  state_of_origin: string
  state_of_residence: string
  lga: string
  ward: string
  polling_unit: string
  background: string
  experience: string
  photo_data: string | null
  status: ApplicationStatus
  whatsapp_confirmed_at: Date | null
  email_verified_at: Date | null
  training_progress: number
  submitted_at: Date
  updated_at: Date
}

export interface HistoryRow {
  application_id?: string
  incident_id?: string
  action: string
  note: string | null
  actor_label: string
  created_at: Date
}

export interface IncidentRow {
  id: string
  public_id: string
  type: string
  description: string
  severity: Severity
  state: string
  lga: string
  ward: string
  polling_unit: string
  lat: number
  lng: number
  occurred_at: Date
  reported_at: Date
  reporter_name: string
  reporter_id: string
  status: IncidentStatus
  category: string | null
  election_day: boolean
}

export interface WarningRow {
  id: string
  public_id: string
  type: string
  title: string
  summary: string
  state: string
  lga: string
  level: 'Watch' | 'Alert' | 'Urgent'
  access: 'Command only' | 'State coordinators' | 'All Guards in area'
  raised_by_label: string
  created_at: Date
  evidence_count: number
  lat: number
  lng: number
  resolved_at: Date | null
  resolution_note: string | null
}

export interface AnnouncementRow {
  id: string
  from_label: string
  tier: Announcement['tier']
  kind: Announcement['kind']
  title: string
  body: string
  audience: string
  created_at: Date
}

const iso = (value: Date | string): string =>
  typeof value === 'string' ? value : value.toISOString()

const dateOnly = (value: Date | string): string =>
  typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)

function historyOf(rows: HistoryRow[]): AuditEntry[] {
  return rows
    .map((row) => ({
      at: iso(row.created_at),
      by: row.actor_label,
      action: row.action,
      note: row.note ?? undefined,
    }))
    .sort((a, b) => a.at.localeCompare(b.at))
}

export interface ApplicationMapOptions {
  history?: HistoryRow[]
  maskSensitive?: boolean
  assessmentScore?: number
}

export function mapApplication(row: ApplicationRow, options: ApplicationMapOptions = {}): Application {
  const masked = options.maskSensitive === true
  return {
    id: row.public_id,
    yegoId: row.yego_id ?? undefined,
    fullName: row.full_name,
    gender: row.gender,
    dateOfBirth: dateOnly(row.date_of_birth),
    phone: masked ? '' : row.phone,
    whatsapp: masked ? '' : row.whatsapp,
    nin: masked ? '•••••••••••' : `•••••••${row.nin_last4 ?? '••••'}`,
    email: masked ? '' : row.email,
    stateOfOrigin: row.state_of_origin,
    stateOfResidence: row.state_of_residence,
    lga: row.lga,
    ward: row.ward,
    pollingUnit: row.polling_unit,
    background: masked ? '' : row.background,
    experience: masked ? '' : row.experience,
    photo: row.photo_data ?? undefined,
    status: row.status,
    submittedAt: iso(row.submitted_at),
    confirmedWhatsApp: !!row.whatsapp_confirmed_at,
    emailVerified: !!row.email_verified_at,
    trainingProgress: row.training_progress,
    assessmentScore: options.assessmentScore,
    history: historyOf(options.history ?? []),
  }
}

export interface IncidentRelations {
  evidence?: { kind: 'photo' | 'video' | 'document'; name: string }[]
  history?: HistoryRow[]
  referrals?: { agency: string; at: string; by: string }[]
}

export function mapIncident(row: IncidentRow, relations: IncidentRelations = {}): Incident {
  return {
    id: row.public_id,
    type: row.type,
    description: row.description,
    severity: row.severity,
    state: row.state,
    lga: row.lga,
    ward: row.ward,
    pollingUnit: row.polling_unit,
    lat: Number(row.lat),
    lng: Number(row.lng),
    occurredAt: iso(row.occurred_at),
    reportedAt: iso(row.reported_at),
    reporter: row.reporter_name,
    reporterId: row.reporter_id,
    evidence: relations.evidence ?? [],
    status: row.status,
    category: row.category ?? undefined,
    referrals: relations.referrals ?? [],
    audit: historyOf(relations.history ?? []),
    electionDay: row.election_day,
  }
}

export function mapWarning(row: WarningRow): EarlyWarning {
  return {
    id: row.public_id,
    type: row.type,
    title: row.title,
    summary: row.summary,
    state: row.state,
    lga: row.lga,
    level: row.level,
    access: row.access,
    raisedBy: row.raised_by_label,
    raisedAt: iso(row.created_at),
    evidence: row.evidence_count,
    lat: Number(row.lat),
    lng: Number(row.lng),
    resolvedAt: row.resolved_at ? iso(row.resolved_at) : undefined,
    resolutionNote: row.resolution_note ?? undefined,
  }
}

export function mapAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    from: row.from_label,
    tier: row.tier,
    kind: row.kind,
    title: row.title,
    body: row.body,
    audience: row.audience,
    at: iso(row.created_at),
  }
}

export function mapNotification(row: {
  id: string
  kind: string
  title: string
  body: string
  entity_type: string | null
  entity_id: string | null
  read_at: Date | null
  created_at: Date
}): NotificationDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    read: !!row.read_at,
    createdAt: iso(row.created_at),
  }
}

export function groupBy<T, K extends string>(rows: T[], key: (row: T) => K | null | undefined): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const value = key(row)
    if (!value) continue
    const list = map.get(value) ?? []
    list.push(row)
    map.set(value, list)
  }
  return map
}

export { iso }
