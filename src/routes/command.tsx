import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  BarChart3,
  Lock,
  GraduationCap,
  LogOut,
  MapPinned,
  Megaphone,
  Radar,
  ShieldCheck,
  ShieldAlert,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AccessView } from '@/components/command/access'
import { ApplicantsView } from '@/components/command/applicants'
import { CommandNotifications } from '@/components/command/notifications'
import { CoverageView } from '@/components/command/coverage'
import { IncidentsView } from '@/components/command/incidents'
import { OverviewView } from '@/components/command/overview'
import { TrainingView } from '@/components/command/training'
import { UpdatesView } from '@/components/command/updates'
import { WarningsView } from '@/components/command/warnings'
import { YegoLogo } from '@/components/yego/logo'
import { signOut, useDB } from '@/lib/demo-store'
import { can, type Capability } from '@/lib/permissions'
import { cn } from '@/lib/utils'

const VIEWS = [
  { id: 'overview', label: 'ERART Dashboard', icon: BarChart3, cap: 'view:analytics' },
  { id: 'incidents', label: 'Incidents', icon: ShieldAlert, cap: 'view:incidents' },
  { id: 'warnings', label: 'Early warning', icon: Radar, cap: 'view:early-warning' },
  { id: 'coverage', label: 'Coverage & duty', icon: MapPinned, cap: 'view:analytics' },
  { id: 'applicants', label: 'Guards & screening', icon: Users, cap: 'screen:applicants' },
  { id: 'updates', label: 'Shared updates', icon: Megaphone, cap: 'view:analytics' },
  { id: 'training', label: 'Training Dashboard', icon: GraduationCap, cap: 'manage:training' },
  { id: 'access', label: 'Roles & access', icon: ShieldCheck, cap: 'manage:roles' },
] as const satisfies readonly { id: string; label: string; icon: unknown; cap: Capability }[]

type ViewId = (typeof VIEWS)[number]['id']

export const Route = createFileRoute('/command')({
  validateSearch: (s: Record<string, unknown>): { view?: ViewId } => ({
    view: VIEWS.some((v) => v.id === s.view) ? (s.view as ViewId) : undefined,
  }),
  head: () => ({ meta: [{ title: 'Command Centre · YEGO' }] }),
  component: CommandPage,
})

function CommandPage() {
  const { session } = useDB()
  const { view = 'overview' } = Route.useSearch()
  const navigate = useNavigate()

  if (!session || session.kind !== 'command') {
    return (
      <div className="grid min-h-screen place-items-center bg-ink p-4 text-white">
        <div className="max-w-sm text-center">
          <Lock className="mx-auto size-10 text-white/60" />
          <h1 className="mt-3 text-2xl font-black">Command Centre</h1>
          <p className="mt-1 text-sm text-white/70">Restricted to authorised YEGO personnel. Every access is logged.</p>
          <Button asChild className="mt-5 w-full bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/login">Log in with a Command account</Link>
          </Button>
        </div>
      </div>
    )
  }

  const allowed = VIEWS.filter((v) => can(session.role, v.cap))
  const current = allowed.find((v) => v.id === view) ?? allowed[0]
  // State Coordinators only see their own state.
  const lockedState = session.role === 'State Coordinator' ? session.scope : undefined

  return (
    <div className="min-h-screen bg-muted/50 lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex items-center justify-between gap-2 p-4">
          <Link to="/" aria-label="YEGO home">
            <YegoLogo inverted />
          </Link>
          <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-primary">Command</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-1 lg:flex-col lg:overflow-visible" aria-label="Command">
          {allowed.map((v) => (
            <Link
              key={v.id}
              to="/command"
              search={{ view: v.id }}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                current.id === v.id ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-white',
              )}
            >
              <v.icon className="size-4" /> {v.label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-sidebar-border p-4 text-sm lg:block">
          <p className="font-semibold text-white">{session.name}</p>
          <p className="text-xs text-sidebar-foreground/70">
            {session.role} · {session.scope}
          </p>
          <div className="mt-3 flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
              onClick={() => {
                void signOut().then(() => navigate({ to: '/login' }))
              }}
            >
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-xl font-black">{current.label}</h1>
            <p className="text-xs text-muted-foreground">
              {current.id === 'overview' ? 'ERART · Early Warning & Rapid Response Tool · ' : ''}
              {session.role} · {lockedState ? `${lockedState} State only` : session.scope}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CommandNotifications />
            <Button
              size="sm"
              variant="outline"
              className="lg:hidden"
              onClick={() => {
                void signOut().then(() => navigate({ to: '/login' }))
              }}
            >
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          {current.id === 'overview' && <OverviewView lockedState={lockedState} />}
          {current.id === 'incidents' && <IncidentsView lockedState={lockedState} />}
          {current.id === 'warnings' && <WarningsView lockedState={lockedState} />}
          {current.id === 'coverage' && <CoverageView lockedState={lockedState} />}
          {current.id === 'applicants' && <ApplicantsView lockedState={lockedState} />}
          {current.id === 'updates' && <UpdatesView />}
          {current.id === 'training' && <TrainingView />}
          {current.id === 'access' && <AccessView />}
        </div>
      </main>
    </div>
  )
}
