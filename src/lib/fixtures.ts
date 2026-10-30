// Stubbed operational data for the first product milestone. Every screen
// reads from here (via demo-store.ts) so a later milestone can swap this
// module for Netlify Database queries without touching the UI.
import { STATES } from './nigeria'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const APPLICATION_STAGES = [
  'Application Submitted',
  'Under Review',
  'Screening',
  'Approved',
  'Training Required',
  'Training Completed',
  'Certified/Active',
] as const
export type ApplicationStatus =
  | (typeof APPLICATION_STAGES)[number]
  | 'Not Approved'

export const INCIDENT_STAGES = [
  'Reported',
  'Received',
  'Under Review',
  'Verified',
  'Unverified',
  'Referred/Actioned',
  'Closed',
] as const
export type IncidentStatus = (typeof INCIDENT_STAGES)[number]

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical'

export const INCIDENT_TYPES = [
  'Violence / physical attack',
  'Ballot snatching / box theft',
  'Vote buying / inducement',
  'Voter intimidation',
  'Late arrival of materials / officials',
  'BVAS / technology failure',
  'Underage or multiple voting',
  'Obstruction of observers / media',
  'Result sheet manipulation',
  'Attack on electoral personnel',
  'Misinformation / disinformation',
  'Other',
] as const

export const EARLY_WARNING_TYPES = [
  'Emerging political tension',
  'Threats of violence',
  'Community conflict',
  'Misinformation / disinformation',
  'Threats against electoral personnel',
  'Security concern',
  'Other emerging risk',
] as const

export interface AuditEntry {
  at: string
  by: string
  action: string
  note?: string
}

export interface Application {
  id: string
  yegoId?: string
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
  pollingUnit: string
  background: string
  experience: string
  photo?: string
  status: ApplicationStatus
  submittedAt: string
  confirmedWhatsApp: boolean
  emailVerified: boolean
  trainingProgress: number
  assessmentScore?: number
  history: AuditEntry[]
}

export interface IncidentEvidence {
  id: string
  kind: 'photo' | 'video' | 'document'
  name: string
  mimeType?: string
  byteSize?: number
  /** True when the original file bytes are actually stored; legacy rows without a stored file are false. */
  hasFile: boolean
}

export interface Incident {
  id: string
  type: string
  description: string
  severity: Severity
  state: string
  lga: string
  ward: string
  pollingUnit: string
  lat: number
  lng: number
  occurredAt: string
  reportedAt: string
  reporter: string
  reporterId: string
  evidence: IncidentEvidence[]
  status: IncidentStatus
  category?: string
  referrals: { agency: string; at: string; by: string }[]
  audit: AuditEntry[]
  electionDay: boolean
}

export interface EarlyWarning {
  id: string
  type: string
  title: string
  summary: string
  state: string
  lga: string
  level: 'Watch' | 'Alert' | 'Urgent'
  access: 'Command only' | 'State coordinators' | 'All Guards in area'
  raisedBy: string
  raisedAt: string
  evidence: number
  lat: number
  lng: number
  resolvedAt?: string
  resolutionNote?: string
}

export interface Announcement {
  id: string
  from: string
  tier: 'National Command' | 'Regional/State' | 'LGA/Field'
  kind:
    | 'Announcement'
    | 'Operational instruction'
    | 'Alert'
    | 'Training'
    | 'Emergency'
  title: string
  body: string
  audience: string
  at: string
}

export interface Agency {
  code: string
  name: string
  remit: string
  color: string
  contact: string
}

/* ------------------------------------------------------------------ */
/* Reference lists                                                     */
/* ------------------------------------------------------------------ */

// Response channels a verified incident can be forwarded to. Brand colours
// approximate each agency's identity; official crests must be supplied by
// YEGO with permission before they are displayed (see PLAN.md).
export const AGENCIES: Agency[] = [
  { code: 'INEC', name: 'Independent National Electoral Commission', remit: 'Electoral process, officials, materials, BVAS and results', color: '#0a7a3d', contact: 'Situation Room, INEC HQ Abuja' },
  { code: 'NPF', name: 'Nigeria Police Force', remit: 'Lead agency for election security, violence and threats', color: '#0b2a5b', contact: 'Election Monitoring Unit · 112' },
  { code: 'ICCES', name: 'Inter-Agency Consultative Committee on Election Security', remit: 'Joint security coordination across agencies', color: '#3b3f46', contact: 'ICCES Secretariat via INEC' },
  { code: 'DSS', name: 'Department of State Services', remit: 'Intelligence on threats, subversion and organised violence', color: '#1d1d1f', contact: 'State Command Liaison' },
  { code: 'NSCDC', name: 'Nigeria Security and Civil Defence Corps', remit: 'Protection of critical assets and polling environments', color: '#5b3a14', contact: 'State Command Operations' },
  { code: 'NA', name: 'Nigerian Army', remit: 'Support to civil authority on request (outer cordon)', color: '#3d5a2a', contact: 'Through ICCES only' },
  { code: 'EFCC', name: 'Economic and Financial Crimes Commission', remit: 'Vote buying and electoral financial crimes', color: '#8a1c1c', contact: 'Election Monitoring Desk' },
  { code: 'ICPC', name: 'Independent Corrupt Practices Commission', remit: 'Inducement and abuse of office during elections', color: '#1f4e8a', contact: 'Public Petitions Desk' },
  { code: 'NHRC', name: 'National Human Rights Commission', remit: 'Rights violations against voters, observers and officials', color: '#0e6f74', contact: 'Election Human Rights Desk' },
  { code: 'NOA', name: 'National Orientation Agency', remit: 'Countering misinformation and public sensitisation', color: '#b46d00', contact: 'State Directorate' },
  { code: 'NEMA', name: 'National Emergency Management Agency', remit: 'Medical, fire and humanitarian emergencies', color: '#c2410c', contact: 'Emergency Operations · 112' },
]

export interface Role {
  name: string
  scope: string
  permissions: string[]
  operational: boolean
}

export const ROLES: Role[] = [
  { name: 'Super Administrator', scope: 'Entire platform', permissions: ['Manage all users and roles', 'System settings & audit logs', 'Backups and data exports'], operational: true },
  { name: 'National YEGO Administrator', scope: 'All 36 states + FCT', permissions: ['Report incidents to any agency', 'Approve verification', 'National announcements', 'Refer incidents to agencies'], operational: true },
  { name: 'Regional Coordinator', scope: 'Geopolitical zone', permissions: ['Zone dashboards', 'Regional instructions', 'Early-warning escalation'], operational: true },
  { name: 'State Coordinator', scope: 'One state', permissions: ['Full operational access within the state', 'Screen and approve applicants', 'Verify and refer incidents', 'Assign polling units', 'Training dashboard and state messages'], operational: true },
  { name: 'LGA Coordinator', scope: 'One LGA', permissions: ['Field roll-call', 'Ward-level messages', 'First-line report triage'], operational: true },
  { name: 'Verification Officer', scope: 'Assigned queue', permissions: ['Screen and approve applicants', 'Message applicants with next steps', 'Review evidence', 'Request clarification', 'Verify / unverify incidents'], operational: true },
  { name: 'Training Officer', scope: 'Training Centre', permissions: ['Track applicant training progress', 'Record and update progress', 'Message applicants', 'Issue certificates', 'Export progress reports'], operational: true },
  { name: 'YEGO Guard', scope: 'Assigned polling unit', permissions: ['Report incidents', 'Early-warning tips', 'Receive instructions'], operational: true },
  { name: 'Partner/Observer', scope: 'Shared views', permissions: ['Aggregated, anonymised analytics', 'Published statements'], operational: false },
  { name: 'Public User', scope: 'Public website', permissions: ['Apply to join', 'Check application status', 'Read news'], operational: false },
]

export interface TrainingModule {
  id: string
  title: string
  kind: 'Video' | 'Manual' | 'Module'
  minutes: number
  summary: string
  quiz: { q: string; options: string[]; answer: number }[]
}

export const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'm1',
    title: 'The YEGO Guard: role, ethics & non-partisanship',
    kind: 'Video',
    minutes: 20,
    summary: 'What an observer does and does not do, the YEGO Code of Conduct, and staying impartial under pressure.',
    quiz: [
      { q: 'A party agent offers you transport money on election day. You should:', options: ['Accept it quietly', 'Decline and report it as an inducement attempt', 'Share it with other Guards'], answer: 1 },
      { q: 'YEGO Guards may wear party colours if they are subtle.', options: ['True', 'False'], answer: 1 },
    ],
  },
  {
    id: 'm2',
    title: 'Nigeria’s electoral framework: Electoral Act 2022 & INEC guidelines',
    kind: 'Manual',
    minutes: 25,
    summary: 'Key provisions on accreditation, BVAS, IReV result upload, and the rights of accredited observers.',
    quiz: [
      { q: 'Which device is used for voter accreditation at the polling unit?', options: ['PVC reader v1', 'BVAS', 'IReV'], answer: 1 },
      { q: 'Polling unit results are uploaded for public viewing on:', options: ['IReV', 'NIMC portal', 'Social media'], answer: 0 },
    ],
  },
  {
    id: 'm3',
    title: 'Early warning: spotting risk before it becomes violence',
    kind: 'Module',
    minutes: 22,
    summary: 'Indicators of tension, hate speech and mobilisation, and how to submit a verified early-warning tip.',
    quiz: [
      { q: 'Which is an early-warning indicator?', options: ['Large peaceful queue', 'Armed youths gathering near a polling unit', 'Officials arriving on time'], answer: 1 },
    ],
  },
  {
    id: 'm4',
    title: 'Reporting incidents accurately with evidence',
    kind: 'Video',
    minutes: 20,
    summary: 'Where, what, when, evidence: using Election-Day Mode, capturing safe photos, and protecting yourself.',
    quiz: [
      { q: 'Your personal safety vs capturing evidence: which comes first?', options: ['Evidence', 'Personal safety'], answer: 1 },
    ],
  },
  {
    id: 'm6',
    title: 'Digital reporting and the ERART platform',
    kind: 'Module',
    minutes: 25,
    summary: 'Using the Early Warning & Rapid Response Tool to submit, document, share and track a report through verification.',
    quiz: [
      { q: 'Which platform is used to submit and document an incident?', options: ['ERART', 'A social media post', 'A phone call to a friend'], answer: 0 },
      { q: 'What must happen before an incident is referred to an agency?', options: ['It must be verified', 'It must be posted online', 'It must be deleted'], answer: 0 },
    ],
  },
  {
    id: 'm7',
    title: 'Coordination, escalation and agency protocols',
    kind: 'Manual',
    minutes: 20,
    summary: 'Working with state and LGA coordinators, escalation paths, and the agencies that receive verified referrals.',
    quiz: [
      { q: 'Who should receive a verified incident referral?', options: ['Any social media user', 'The responsible agency through the referral workflow', 'A political party'], answer: 1 },
    ],
  },
  {
    id: 'm8',
    title: 'Electoral Violence Prevention',
    kind: 'Video',
    minutes: 28,
    summary: 'Recognising the drivers of electoral violence, de-escalation, safe reporting and community-level prevention.',
    quiz: [
      { q: 'Which action helps prevent electoral violence?', options: ['Spreading unverified rumours', 'Promoting peaceful participation and early reporting', 'Confronting political opponents'], answer: 1 },
      { q: 'What should a Guard do if violence breaks out?', options: ['Record first', 'Move to safety and call 112, then report', 'Join the crowd'], answer: 1 },
    ],
  },
  {
    id: 'm9',
    title: 'Field Preparedness and Practical Assessment',
    kind: 'Module',
    minutes: 30,
    summary: 'A practical field-readiness assessment covering safety, reporting, check-in, evidence and coordination.',
    quiz: [
      { q: 'What is the first priority during field reporting?', options: ['Personal safety', 'Capturing the perfect photo', 'Confronting the offender'], answer: 0 },
      { q: 'Which evidence is required before submitting a report?', options: ['A photo or video is mandatory', 'Evidence is optional; a report can be submitted without it', 'Only a witness statement'], answer: 1 },
    ],
  },
]


export const PROFESSIONAL_BACKGROUNDS = [
  'Student (tertiary)',
  'NYSC corps member',
  'Graduate / job seeker',
  'Teacher / educator',
  'Legal professional',
  'Health worker',
  'ICT / tech professional',
  'Journalist / media',
  'Trader / business owner',
  'Civil servant',
  'Other',
]

/* ------------------------------------------------------------------ */
/* Seed records                                                        */
/* ------------------------------------------------------------------ */

const d = (iso: string) => new Date(iso).toISOString()

function hist(
  stages: ApplicationStatus[],
  start: string,
  by = 'Screening Desk',
): AuditEntry[] {
  const t0 = new Date(start).getTime()
  return stages.map((s, i) => ({
    at: new Date(t0 + i * 26 * 3600_000).toISOString(),
    by: i === 0 ? 'Applicant' : by,
    action: s,
  }))
}

const upTo = (s: ApplicationStatus) =>
  APPLICATION_STAGES.slice(
    0,
    APPLICATION_STAGES.indexOf(s as (typeof APPLICATION_STAGES)[number]) + 1,
  ) as ApplicationStatus[]

type SeedApp = [
  name: string,
  gender: 'Female' | 'Male',
  state: string,
  lga: string,
  ward: string,
  pu: string,
  status: ApplicationStatus,
  bg: string,
  date: string,
]

const SEED_APPS: SeedApp[] = [
  ['Aisha Bello', 'Female', 'Kano', 'Nasarawa', 'Gwagwarwa', 'PU 012 – Gwagwarwa Pri. Sch.', 'Certified/Active', 'NYSC corps member', '2026-09-20'],
  ['Chinedu Okafor', 'Male', 'Anambra', 'Awka South', 'Awka I', 'PU 004 – Ezioka Square', 'Certified/Active', 'Legal professional', '2026-09-21'],
  ['Funmilayo Adeyemi', 'Female', 'Lagos', 'Surulere', 'Ward D', 'PU 027 – Randle Ave. Open Space', 'Certified/Active', 'ICT / tech professional', '2026-09-22'],
  ['Emeka Nwosu', 'Male', 'Rivers', 'Obio/Akpor', 'Rumuokoro', 'PU 009 – Rumuokoro Town Hall', 'Training Completed', 'Graduate / job seeker', '2026-09-25'],
  ['Hauwa Musa', 'Female', 'Borno', 'Maiduguri', 'Bolori I', 'PU 015 – Bolori Pri. Sch.', 'Training Required', 'Health worker', '2026-09-28'],
  ['Tunde Bakare', 'Male', 'Oyo', 'Ibadan North', 'Ward 4', 'PU 006 – Agodi Gate', 'Approved', 'Student (tertiary)', '2026-10-01'],
  ['Blessing Etim', 'Female', 'Akwa Ibom', 'Uyo', 'Uyo Urban I', 'PU 021 – Ibom Plaza', 'Screening', 'Journalist / media', '2026-10-04'],
  ['Ibrahim Danladi', 'Male', 'Kaduna', 'Zaria', 'Tudun Wada', 'PU 018 – Tudun Wada Mkt.', 'Screening', 'Teacher / educator', '2026-10-06'],
  ['Ngozi Eze', 'Female', 'Enugu', 'Enugu North', 'GRA', 'PU 003 – GRA Civic Centre', 'Under Review', 'Civil servant', '2026-10-09'],
  ['Musa Garba', 'Male', 'FCT', 'Abuja Municipal (AMAC)', 'Garki', 'PU 031 – Area 10 Pri. Sch.', 'Under Review', 'NYSC corps member', '2026-10-11'],
  ['Zainab Yusuf', 'Female', 'Sokoto', 'Sokoto North', 'Magajin Gari', 'PU 008 – Sultan Bello Mosque Area', 'Application Submitted', 'Student (tertiary)', '2026-10-15'],
  ['Oluwaseun Ajayi', 'Male', 'Ekiti', 'Ado-Ekiti', 'Ward 7', 'PU 011 – Okesa Pri. Sch.', 'Application Submitted', 'Graduate / job seeker', '2026-10-16'],
  ['Grace Ochanya', 'Female', 'Benue', 'Makurdi', 'Wadata', 'PU 014 – Wadata Mkt.', 'Application Submitted', 'Trader / business owner', '2026-10-17'],
  ['Yakubu Sani', 'Male', 'Plateau', 'Jos North', 'Ali Kazaure', 'PU 002 – Terminus Mkt.', 'Not Approved', 'Other', '2026-09-30'],
]

export const SEED_APPLICATIONS: Application[] = SEED_APPS.map(
  ([fullName, gender, state, lga, ward, pu, status, bg, date], i) => {
    const n = String(240112 + i * 1373).slice(-6)
    const active = status === 'Certified/Active'
    const stages: ApplicationStatus[] =
      status === 'Not Approved'
        ? ['Application Submitted', 'Under Review', 'Screening', 'Not Approved']
        : upTo(status)
    return {
      id: `YG-APP-${n}`,
      yegoId: active ? `YEGO/${getCode(state)}/${n.slice(-4)}` : undefined,
      fullName,
      gender,
      dateOfBirth: `${1996 + (i % 9)}-0${(i % 9) + 1}-1${i % 9}`,
      phone: `080${String(31234567 + i * 7919).slice(0, 8)}`,
      whatsapp: `080${String(31234567 + i * 7919).slice(0, 8)}`,
      nin: `•••••••${String(1000 + i * 37).slice(-4)}`,
      email: `${fullName.split(' ')[0].toLowerCase()}@example.ng`,
      stateOfOrigin: state,
      stateOfResidence: state,
      lga,
      ward,
      pollingUnit: pu,
      background: bg,
      experience:
        i % 3 === 0
          ? 'Served as ad-hoc staff during 2023 general elections.'
          : i % 3 === 1
            ? 'Volunteered with a campus voter-education campaign.'
            : 'No previous electoral experience; active in community youth association.',
      status,
      submittedAt: d(date),
      confirmedWhatsApp: i % 4 !== 3,
      emailVerified: i % 2 === 0,
      trainingProgress: active
        ? 100
        : status === 'Training Completed'
          ? 100
          : status === 'Training Required'
            ? 40
            : 0,
      history: hist(stages, date),
    }
  },
)

function getCode(state: string) {
  return STATES.find((s) => s.name === state)?.code ?? 'NG'
}

export const SEED_INCIDENTS: Incident[] = [
  { id: 'INC-26-000184', type: 'Vote buying / inducement', description: 'Two men distributing cash envelopes to voters in the queue after accreditation, near the school gate.', severity: 'High', state: 'Kano', lga: 'Nasarawa', ward: 'Gwagwarwa', pollingUnit: 'PU 012 – Gwagwarwa Pri. Sch.', lat: 12.0105, lng: 8.5502, occurredAt: d('2026-10-17T10:42:00+01:00'), reportedAt: d('2026-10-17T10:47:00+01:00'), reporter: 'Aisha Bello', reporterId: 'YEGO/KN/1012', evidence: [{ id: 'ev-seed-1a', kind: 'photo', name: 'queue-cash.jpg', hasFile: false }, { id: 'ev-seed-1b', kind: 'video', name: 'gate-clip.mp4', hasFile: false }], status: 'Referred/Actioned', category: 'Electoral offence', referrals: [{ agency: 'EFCC', at: d('2026-10-17T11:20:00+01:00'), by: 'Verification Officer · Kano' }], audit: [{ at: d('2026-10-17T10:47:00+01:00'), by: 'Aisha Bello', action: 'Reported' }, { at: d('2026-10-17T10:52:00+01:00'), by: 'System', action: 'Received' }, { at: d('2026-10-17T11:03:00+01:00'), by: 'V. Officer A. Lawal', action: 'Under Review' }, { at: d('2026-10-17T11:15:00+01:00'), by: 'V. Officer A. Lawal', action: 'Verified', note: 'Video matches GPS and PU photo.' }, { at: d('2026-10-17T11:20:00+01:00'), by: 'V. Officer A. Lawal', action: 'Referred/Actioned', note: 'Forwarded to EFCC election desk.' }], electionDay: true },
  { id: 'INC-26-000191', type: 'Violence / physical attack', description: 'Thugs on motorcycles disrupted voting, one voter injured. Polling officials fled with BVAS.', severity: 'Critical', state: 'Rivers', lga: 'Obio/Akpor', ward: 'Rumuokoro', pollingUnit: 'PU 009 – Rumuokoro Town Hall', lat: 4.8722, lng: 6.9967, occurredAt: d('2026-10-17T12:05:00+01:00'), reportedAt: d('2026-10-17T12:08:00+01:00'), reporter: 'Emeka Nwosu', reporterId: 'YEGO/RI/1004', evidence: [{ id: 'ev-seed-2a', kind: 'photo', name: 'scene-1.jpg', hasFile: false }], status: 'Under Review', referrals: [], audit: [{ at: d('2026-10-17T12:08:00+01:00'), by: 'Emeka Nwosu', action: 'Reported' }, { at: d('2026-10-17T12:09:00+01:00'), by: 'System', action: 'Received' }, { at: d('2026-10-17T12:14:00+01:00'), by: 'V. Officer T. George', action: 'Under Review' }], electionDay: true },
  { id: 'INC-26-000196', type: 'BVAS / technology failure', description: 'BVAS failed to authenticate fingerprints for over 40 minutes; officials switched to facial capture.', severity: 'Medium', state: 'Lagos', lga: 'Surulere', ward: 'Ward D', pollingUnit: 'PU 027 – Randle Ave. Open Space', lat: 6.4969, lng: 3.3554, occurredAt: d('2026-10-17T09:15:00+01:00'), reportedAt: d('2026-10-17T09:30:00+01:00'), reporter: 'Funmilayo Adeyemi', reporterId: 'YEGO/LA/1027', evidence: [{ id: 'ev-seed-3a', kind: 'photo', name: 'bvas.jpg', hasFile: false }], status: 'Verified', category: 'Logistics / technology', referrals: [], audit: [{ at: d('2026-10-17T09:30:00+01:00'), by: 'Funmilayo Adeyemi', action: 'Reported' }, { at: d('2026-10-17T09:31:00+01:00'), by: 'System', action: 'Received' }, { at: d('2026-10-17T09:44:00+01:00'), by: 'V. Officer K. Ade', action: 'Verified' }], electionDay: true },
  { id: 'INC-26-000201', type: 'Late arrival of materials / officials', description: 'No INEC officials or materials as of 10:30am. Over 200 voters waiting.', severity: 'Medium', state: 'Anambra', lga: 'Awka South', ward: 'Awka I', pollingUnit: 'PU 004 – Ezioka Square', lat: 6.2209, lng: 7.0722, occurredAt: d('2026-10-17T10:30:00+01:00'), reportedAt: d('2026-10-17T10:33:00+01:00'), reporter: 'Chinedu Okafor', reporterId: 'YEGO/AN/1004', evidence: [], status: 'Received', referrals: [], audit: [{ at: d('2026-10-17T10:33:00+01:00'), by: 'Chinedu Okafor', action: 'Reported' }, { at: d('2026-10-17T10:34:00+01:00'), by: 'System', action: 'Received' }], electionDay: true },
  { id: 'INC-26-000205', type: 'Voter intimidation', description: 'Armed men in plain clothes stationed 50m from the PU asking voters who they will vote for.', severity: 'High', state: 'Kano', lga: 'Nasarawa', ward: 'Gwagwarwa', pollingUnit: 'PU 012 – Gwagwarwa Pri. Sch.', lat: 12.0131, lng: 8.5541, occurredAt: d('2026-10-17T13:10:00+01:00'), reportedAt: d('2026-10-17T13:12:00+01:00'), reporter: 'Aisha Bello', reporterId: 'YEGO/KN/1012', evidence: [{ id: 'ev-seed-5a', kind: 'photo', name: 'men.jpg', hasFile: false }], status: 'Reported', referrals: [], audit: [{ at: d('2026-10-17T13:12:00+01:00'), by: 'Aisha Bello', action: 'Reported' }], electionDay: true },
  { id: 'INC-26-000177', type: 'Obstruction of observers / media', description: 'Presiding officer refused accredited observers entry to the collation centre.', severity: 'Low', state: 'Lagos', lga: 'Surulere', ward: 'Ward D', pollingUnit: 'PU 027 – Randle Ave. Open Space', lat: 6.4995, lng: 3.3581, occurredAt: d('2026-10-16T17:40:00+01:00'), reportedAt: d('2026-10-16T18:02:00+01:00'), reporter: 'Funmilayo Adeyemi', reporterId: 'YEGO/LA/1027', evidence: [{ id: 'ev-seed-6a', kind: 'document', name: 'accreditation.pdf', hasFile: false }], status: 'Closed', category: 'Observer access', referrals: [{ agency: 'INEC', at: d('2026-10-16T18:30:00+01:00'), by: 'State Coordinator · Lagos' }], audit: [{ at: d('2026-10-16T18:02:00+01:00'), by: 'Funmilayo Adeyemi', action: 'Reported' }, { at: d('2026-10-16T18:30:00+01:00'), by: 'State Coordinator · Lagos', action: 'Referred/Actioned' }, { at: d('2026-10-16T20:10:00+01:00'), by: 'State Coordinator · Lagos', action: 'Closed', note: 'INEC REC intervened; access granted.' }], electionDay: false },
]

export const SEED_WARNINGS: EarlyWarning[] = [
  { id: 'EW-26-0042', type: 'Threats of violence', title: 'Youth mobilisation ahead of ward collation', summary: 'Multiple Guards report groups of youths being paid to "guard" collation centres in Obio/Akpor wards.', state: 'Rivers', lga: 'Obio/Akpor', level: 'Urgent', access: 'Command only', raisedBy: 'LGA Coordinator · Obio/Akpor', raisedAt: d('2026-10-16T19:20:00+01:00'), evidence: 3, lat: 4.85, lng: 7.0 },
  { id: 'EW-26-0039', type: 'Misinformation / disinformation', title: 'Fake "postponement" voice notes circulating', summary: 'WhatsApp voice notes falsely claim the election in Kano Municipal has been shifted. NOA and INEC notified.', state: 'Kano', lga: 'Kano Municipal', level: 'Alert', access: 'All Guards in area', raisedBy: 'State Coordinator · Kano', raisedAt: d('2026-10-15T08:10:00+01:00'), evidence: 2, lat: 11.99, lng: 8.52 },
  { id: 'EW-26-0035', type: 'Community conflict', title: 'Farmer–herder tension near polling units', summary: 'Recent clashes in two wards could suppress turnout. Recommend security presence at 6 PUs.', state: 'Benue', lga: 'Guma', level: 'Alert', access: 'State coordinators', raisedBy: 'Regional Coordinator · North Central', raisedAt: d('2026-10-13T14:00:00+01:00'), evidence: 4, lat: 7.86, lng: 8.62 },
  { id: 'EW-26-0031', type: 'Emerging political tension', title: 'Rival rallies scheduled on same route', summary: 'Two party rallies planned for the same Saturday along Zaria Road; risk of clashes.', state: 'Kaduna', lga: 'Zaria', level: 'Watch', access: 'State coordinators', raisedBy: 'LGA Coordinator · Zaria', raisedAt: d('2026-10-12T11:30:00+01:00'), evidence: 1, lat: 11.08, lng: 7.71 },
]

export const SEED_ANNOUNCEMENTS: Announcement[] = [
  { id: 'a1', from: 'National Command', tier: 'National Command', kind: 'Emergency', title: 'Stay safe first', body: 'If violence breaks out, move to safety before reporting. Use Election-Day Mode: it takes under 60 seconds.', audience: 'All Guards', at: d('2026-10-17T06:00:00+01:00') },
  { id: 'a2', from: 'National Command', tier: 'National Command', kind: 'Operational instruction', title: 'Arrive at your polling unit by 7:30am', body: 'Check in on the platform on arrival so your coordinator can confirm coverage. Report late materials after 9:00am.', audience: 'All Guards', at: d('2026-10-16T18:00:00+01:00') },
  { id: 'a3', from: 'Lagos State Coordination', tier: 'Regional/State', kind: 'Training', title: 'Refresher: results-sheet (EC8A) photography', body: 'Short refresher session Thursday 4pm. Module 4 has been updated with new examples.', audience: 'Lagos Guards', at: d('2026-10-14T12:00:00+01:00') },
  { id: 'a4', from: 'Surulere LGA Desk', tier: 'LGA/Field', kind: 'Announcement', title: 'Vest & ID card pickup', body: 'Collect your YEGO vest and ID at the Surulere LGA secretariat, Saturday 10am–2pm.', audience: 'Surulere Guards', at: d('2026-10-12T09:00:00+01:00') },
]

/* ------------------------------------------------------------------ */
/* National aggregates (stub)                                          */
/* ------------------------------------------------------------------ */

// Deterministic pseudo-figures per state, roughly proportional to polling
// units, so the dashboard looks realistic before real data arrives.
export const STATE_COVERAGE = STATES.map((s, i) => {
  const factor = 0.18 + ((i * 37) % 23) / 100
  const registered = Math.round(s.pollingUnits * factor * 1.6)
  const verified = Math.round(registered * (0.55 + ((i * 13) % 20) / 100))
  const trained = Math.round(verified * (0.6 + ((i * 7) % 25) / 100))
  const pusCovered = Math.min(s.pollingUnits, Math.round(trained * 0.92))
  return {
    state: s.name,
    zone: s.zone,
    registered,
    verified,
    trained,
    pusCovered,
    pollingUnits: s.pollingUnits,
    incidents: Math.round(((i * 17) % 40) + s.pollingUnits / 900),
  }
})

// Demo accounts for the preview login. Replaced by Netlify Identity with
// role metadata in milestone 2.
export interface DemoAccount {
  email: string
  name: string
  role: string
  scope: string
  kind: 'command' | 'guard'
  applicationId?: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'superadmin@yego.ng', name: 'ICT Super Admin', role: 'Super Administrator', scope: 'Entire platform', kind: 'command' },
  { email: 'command@yego.ng', name: 'National Command Desk', role: 'National YEGO Administrator', scope: 'National', kind: 'command' },
  { email: 'verify@yego.ng', name: 'A. Lawal', role: 'Verification Officer', scope: 'National queue', kind: 'command' },
  { email: 'lagos@yego.ng', name: 'Lagos State Coordinator', role: 'State Coordinator', scope: 'Lagos', kind: 'command' },
  { email: 'training@yego.ng', name: 'Training Desk', role: 'Training Officer', scope: 'Training Centre', kind: 'command' },
  { email: 'funmi@example.ng', name: 'Funmilayo Adeyemi', role: 'YEGO Guard', scope: 'PU 027 · Surulere, Lagos', kind: 'guard', applicationId: SEED_APPLICATIONS[2].id },
]
