import { cn } from '@/lib/utils'
import type {
  ApplicationStatus,
  EarlyWarning,
  IncidentStatus,
  Severity,
} from '@/lib/fixtures'

const APP_TONE: Record<ApplicationStatus, string> = {
  'Application Submitted': 'bg-muted text-foreground border-border',
  'Under Review': 'bg-sky-50 text-sky-800 border-sky-200',
  Screening: 'bg-amber-50 text-amber-800 border-amber-200',
  Approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Training Required': 'bg-violet-50 text-violet-800 border-violet-200',
  'Training Completed': 'bg-teal-50 text-teal-800 border-teal-200',
  'Certified/Active': 'bg-primary text-primary-foreground border-primary',
  'Not Approved': 'bg-red-50 text-red-800 border-red-200',
}

const INC_TONE: Record<IncidentStatus, string> = {
  Reported: 'bg-muted text-foreground border-border',
  Received: 'bg-sky-50 text-sky-800 border-sky-200',
  'Under Review': 'bg-amber-50 text-amber-800 border-amber-200',
  Verified: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Unverified: 'bg-zinc-100 text-zinc-700 border-zinc-300',
  'Referred/Actioned': 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Closed: 'bg-zinc-800 text-white border-zinc-800',
}

const SEV_TONE: Record<Severity, string> = {
  Low: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  Medium: 'bg-amber-50 text-amber-800 border-amber-200',
  High: 'bg-orange-100 text-orange-800 border-orange-200',
  Critical: 'bg-red-600 text-white border-red-600',
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  Low: '#71717a',
  Medium: '#d97706',
  High: '#ea580c',
  Critical: '#dc2626',
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function AppStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Pill className={APP_TONE[status]}>{status}</Pill>
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Pill className={INC_TONE[status]}>{status}</Pill>
}

const WARN_LEVEL_TONE: Record<EarlyWarning['level'], string> = {
  Watch: 'bg-amber-50 text-amber-800 border-amber-200',
  Alert: 'bg-orange-100 text-orange-800 border-orange-200',
  Urgent: 'bg-red-600 text-white border-red-600',
}

export const WARNING_LEVEL_COLOR: Record<EarlyWarning['level'], string> = {
  Watch: '#d97706',
  Alert: '#ea580c',
  Urgent: '#dc2626',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Pill className={SEV_TONE[severity]}>{severity}</Pill>
}

export function WarningLevelBadge({ level }: { level: EarlyWarning['level'] }) {
  return <Pill className={WARN_LEVEL_TONE[level]}>{level}</Pill>
}
