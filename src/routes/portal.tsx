import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  KeyRound,
  Lock,
  LogOut,
  MailCheck,
  MapPin,
  Megaphone,
  MessageCircle,
  Radio,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { QuickReport } from '@/components/portal/quick-report'
import { TrainingCentre } from '@/components/portal/training-centre'
import { Field, NativeSelect } from '@/components/yego/fields'
import { YegoLogo } from '@/components/yego/logo'
import { NigeriaMap } from '@/components/yego/nigeria-map'
import { ResendVerificationPanel } from '@/components/yego/resend-verification'
import {
  AppStatusBadge,
  IncidentStatusBadge,
  SEVERITY_COLOR,
  SeverityBadge,
} from '@/components/yego/status'
import { ApplicationTracker } from '@/components/yego/tracker'
import { checkIn, confirmWhatsApp, raiseWarning, setGuardPassword, signOut, useDB, type AppNotification } from '@/lib/demo-store'
import {
  EARLY_WARNING_TYPES,
  INCIDENT_STAGES,
  type Announcement,
  type Application,
} from '@/lib/fixtures'
import { WHATSAPP_CHANNEL_URL } from '@/lib/config'
import { fmtDateTime, fmtTimeWAT, nf, timeAgo } from '@/lib/format'
import { getState } from '@/lib/nigeria'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/portal')({
  head: () => ({ meta: [{ title: 'Guard portal · YEGO' }] }),
  component: PortalPage,
})

function PortalPage() {
  const { session, applications, mustChangePassword, emailVerified } = useDB()
  const navigate = useNavigate()
  const app = applications.find((a) => a.id === session?.applicationId)

  if (!session || !app) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/40 p-4">
        <div className="max-w-sm rounded-lg border bg-card p-6 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-black">Guard portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {session?.kind === 'command' ? 'You are signed in with a Command account.' : 'Log in with your Application ID to continue.'}
          </p>
          <Button asChild className="mt-4 w-full">
            <Link to={session?.kind === 'command' ? '/command' : '/login'}>{session?.kind === 'command' ? 'Go to Command' : 'Log in'}</Link>
          </Button>
        </div>
      </div>
    )
  }

  // Gate 1 of 2: before the portal opens, a Guard replaces the initial
  // phone-number password with a real, secret password of their choosing.
  if (session.kind === 'guard' && mustChangePassword) {
    return <SetPasswordScreen name={session.name} />
  }

  // Gate 2 of 2: the protected portal stays closed until the applicant's
  // email address has been verified through the emailed link.
  if (session.kind === 'guard' && emailVerified === false) {
    return <VerifyEmailScreen name={session.name} appId={app.id} />
  }

  const active = app.status === 'Certified/Active'

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-content items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="YEGO home">
            <YegoLogo />
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{active ? 'YEGO Guard' : 'Applicant'}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void signOut().then(() => navigate({ to: '/login' }))
              }}
            >
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-content space-y-6 px-4 py-6 sm:px-6">
        {!app.confirmedWhatsApp && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#25D366]/50 bg-[#e7f8ee] p-4">
            <div>
              <p className="font-bold">Join the YEGO community to confirm your place</p>
              <p className="text-sm text-muted-foreground">
                Screening dates, training access and deployment instructions are shared in the WhatsApp community.
              </p>
            </div>
            <Button
              asChild
              className="bg-[#25D366] text-[#073b1c] hover:bg-[#25D366]/90"
              onClick={() => {
                void confirmWhatsApp(app.id, app.phone || '').catch(() => {})
              }}
            >
              <a href={WHATSAPP_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" /> Join now
              </a>
            </Button>
          </div>
        )}
        <ProfileCard app={app} />
        {active ? <GuardWorkspace app={app} /> : <ApplicantWorkspace app={app} />}
      </main>
    </div>
  )
}

/** Gate 1: first sign-in — the Guard must replace the initial phone-number password. */
function SetPasswordScreen({ name }: { name: string }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Choose a password of at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await setGuardPassword(password)
      toast.success('Password saved. Welcome to your YEGO account.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 sm:p-8">
        <div className="flex items-start justify-between gap-2">
          <KeyRound className="size-8 text-primary" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void signOut().then(() => navigate({ to: '/login' }))
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>
        <h1 className="mt-3 text-2xl font-black">Choose your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Welcome, {name.split(' ')[0]}. You signed in with your initial password (the phone number on your application).
          For your security, choose a private password now — you will use it for every future sign-in. Keep it safe and do
          not share it with anyone.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="New password" htmlFor="npw" hint="At least 8 characters.">
            <Input id="npw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="cpw">
            <Input id="cpw" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            Save password and continue
          </Button>
        </form>
      </div>
    </div>
  )
}

/** Gate 2: the portal stays closed until the applicant's email is verified. */
function VerifyEmailScreen({ name, appId }: { name: string; appId: string }) {
  const navigate = useNavigate()
  return (
    <div className="grid min-h-screen place-items-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="rounded-lg border bg-card p-6 sm:p-8">
          <div className="flex items-start justify-between gap-2">
            <MailCheck className="size-8 text-primary" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void signOut().then(() => navigate({ to: '/login' }))
              }}
            >
              <LogOut /> Sign out
            </Button>
          </div>
          <h1 className="mt-3 text-2xl font-black">Verify your email address</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {name.split(' ')[0]}, one step remains before your applicant portal opens. Open the verification email we sent
            for application <span className="font-mono font-bold text-foreground">{appId}</span> and click{' '}
            <span className="font-semibold text-foreground">Verify My Email Address</span>. The link expires after 72
            hours.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Your application itself is safely recorded — verification only activates your applicant login access. Check
            your spam folder if the email is not in your inbox.
          </p>
        </div>
        <ResendVerificationPanel appId={appId} />
      </div>
    </div>
  )
}

function ProfileCard({ app }: { app: Application }) {
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4 sm:p-5">
      {app.photo ? (
        <img src={app.photo} alt="" className="size-16 rounded-lg object-cover" />
      ) : (
        <span className="grid size-16 place-items-center rounded-lg bg-primary font-display text-xl font-black text-primary-foreground">
          {app.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-black">{app.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">{app.yegoId ?? app.id}</span> · {app.lga}, {app.stateOfResidence}
        </p>
        <p className="text-sm">
          <MapPin className="mr-1 inline size-3.5 text-primary" />
          {app.pollingUnit} · {app.ward}
        </p>
      </div>
      <AppStatusBadge status={app.status} />
    </section>
  )
}

function useMyAnnouncements(app: Application) {
  const { announcements } = useDB()
  return announcements.filter(
    (a) =>
      a.audience === 'All Guards' ||
      a.audience.includes(app.stateOfResidence) ||
      a.audience.includes(app.lga),
  )
}

function Messages({ items }: { items: Announcement[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No messages yet.</p>
  return (
    <ul className="space-y-2">
      {items.map((m) => (
        <li key={m.id} className={cn('rounded-lg border bg-card p-4', m.kind === 'Emergency' && 'border-destructive/40 bg-destructive/5')}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn('rounded-full px-2 py-0.5 font-bold', m.kind === 'Emergency' ? 'bg-destructive text-white' : 'bg-secondary text-secondary-foreground')}>{m.kind}</span>
            <span className="text-muted-foreground">
              {m.from} · {timeAgo(m.at)}
            </span>
          </div>
          <p className="mt-1.5 font-bold">{m.title}</p>
          <p className="text-sm text-muted-foreground">{m.body}</p>
        </li>
      ))}
    </ul>
  )
}

function ApplicantInbox({ items }: { items: AppNotification[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No direct messages yet.</p>
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-primary/30 bg-secondary/50 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-primary px-2 py-0.5 font-bold text-primary-foreground">YEGO</span>
            <span>{timeAgo(item.createdAt)}</span>
          </div>
          <p className="mt-1.5 font-bold">{item.title}</p>
          <p className="text-sm text-muted-foreground">{item.body}</p>
        </li>
      ))}
    </ul>
  )
}

function ApplicantWorkspace({ app }: { app: Application }) {
  const { notifications } = useDB()
  const msgs = useMyAnnouncements(app).filter((m) => m.kind === 'Training' || m.kind === 'Announcement')
  const inbox = notifications.filter((item) => item.kind === 'applicant_message')
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="rounded-lg border bg-card p-5 lg:row-span-2">
        <h2 className="flex items-center gap-2 font-black">
          <ClipboardList className="size-5 text-primary" /> Application progress
        </h2>
        <div className="mt-5">
          <ApplicationTracker app={app} />
        </div>
      </section>
      <section className="space-y-3 lg:col-span-2">
        <h2 className="flex items-center gap-2 font-black">
          <GraduationCap className="size-5 text-primary" /> Training Dashboard
        </h2>
        <TrainingCentre app={app} />
      </section>
      <section className="space-y-3 lg:col-span-2">
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-card p-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-semibold">Incident reporting & polling-unit tools are locked</p>
            <p className="text-muted-foreground">They unlock automatically once you are certified and deployed as a YEGO Guard.</p>
          </div>
        </div>
        <h2 className="flex items-center gap-2 pt-2 font-black">
          <Megaphone className="size-5 text-primary" /> Updates for you
        </h2>
        <Messages items={msgs} />
      </section>
      <section className="space-y-3 lg:col-span-3">
        <h2 className="flex items-center gap-2 font-black">
          <MessageCircle className="size-5 text-primary" /> Messages from YEGO
        </h2>
        <ApplicantInbox items={inbox} />
      </section>
    </div>
  )
}

function GuardWorkspace({ app }: { app: Application }) {
  const { incidents, warnings, notifications, lastCheckInAt } = useDB()
  const msgs = useMyAnnouncements(app)
  const mine = incidents.filter((i) => i.reporter === app.fullName)
  const st = getState(app.stateOfResidence)
  const puIncidents = incidents.filter((i) => i.pollingUnit === app.pollingUnit)
  const areaWarnings = warnings.filter((w) => w.state === app.stateOfResidence && w.access === 'All Guards in area')
  const inbox = notifications.filter((item) => item.kind === 'applicant_message')

  return (
    <Tabs defaultValue="report">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="report" className="flex-none">
          <Radio /> Election-Day report
        </TabsTrigger>
        <TabsTrigger value="pu" className="flex-none">
          <MapPin /> My polling unit
        </TabsTrigger>
        <TabsTrigger value="warn" className="flex-none">
          <BellRing /> Early warning
        </TabsTrigger>
        <TabsTrigger value="msgs" className="flex-none">
          <Megaphone /> Messages ({msgs.length})
        </TabsTrigger>
        <TabsTrigger value="mine" className="flex-none">
          <ClipboardList /> My reports ({mine.length})
        </TabsTrigger>
        <TabsTrigger value="training" className="flex-none">
          <GraduationCap /> Training Dashboard
        </TabsTrigger>
      </TabsList>

      <TabsContent value="report" className="mt-4 space-y-3">
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <span>
            <strong>Danger to life?</strong> Move to safety and call <strong>112</strong> first, then report.
          </span>
        </div>
        <QuickReport guard={app} />
      </TabsContent>

      <TabsContent value="pu" className="mt-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-5">
              <p className="text-xs font-bold uppercase text-primary">Assigned polling unit</p>
              <p className="mt-1 text-lg font-black">{app.pollingUnit}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Ward</dt>
                <dd>{app.ward}</dd>
                <dt className="text-muted-foreground">LGA</dt>
                <dd>{app.lga}</dd>
                <dt className="text-muted-foreground">State</dt>
                <dd>{app.stateOfResidence}</dd>
                <dt className="text-muted-foreground">Zone</dt>
                <dd>{st?.zone}</dd>
                <dt className="text-muted-foreground">State PUs</dt>
                <dd>{st && nf.format(st.pollingUnits)}</dd>
                <dt className="text-muted-foreground">Reports here</dt>
                <dd>{puIncidents.length}</dd>
              </dl>
              <Button
                className="mt-4 w-full"
                variant={lastCheckInAt ? 'secondary' : 'default'}
                onClick={() => {
                  void checkIn()
                    .then(() => {
                      toast.success('Checked in. Your coordinator can see you are on duty.')
                    })
                    .catch((error: unknown) =>
                      toast.error(error instanceof Error ? error.message : 'Could not check in.'),
                    )
                }}
              >
                <CheckCircle2 /> {lastCheckInAt ? `Checked in · ${fmtTimeWAT(lastCheckInAt)}` : 'Check in on arrival'}
              </Button>
              {lastCheckInAt && <p className="mt-2 text-center text-xs text-muted-foreground">Your Command sees this check-in on the Coverage &amp; duty board.</p>}
            </div>
            {areaWarnings.length > 0 && (
              <div className="rounded-lg border border-accent bg-accent/15 p-4 text-sm">
                <p className="font-bold">Area advisories</p>
                {areaWarnings.map((w) => (
                  <p key={w.id} className="mt-1">
                    <strong>{w.level}:</strong> {w.title}
                  </p>
                ))}
              </div>
            )}
          </div>
          <NigeriaMap
            className="h-96 lg:col-span-2"
            showSearch={false}
            focus={puIncidents[0] ? { lat: puIncidents[0].lat, lng: puIncidents[0].lng, zoom: 15 } : st ? { lat: st.lat, lng: st.lng, zoom: 11 } : null}
            markers={puIncidents.map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, color: SEVERITY_COLOR[i.severity], popup: `<b>${i.type}</b><br/>${i.id} · ${i.status}` }))}
          />
        </div>
      </TabsContent>

      <TabsContent value="warn" className="mt-4">
        <WarningTip />
      </TabsContent>

      <TabsContent value="msgs" className="mt-4 space-y-4">
        {inbox.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-2 font-bold">
              <MessageCircle className="size-4 text-primary" /> Direct from YEGO
            </h3>
            <ApplicantInbox items={inbox} />
          </div>
        )}
        <Messages items={msgs} />
      </TabsContent>

      <TabsContent value="mine" className="mt-4">
        {mine.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">You have not submitted any reports yet.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((i) => {
              const idx = INCIDENT_STAGES.indexOf(i.status)
              return (
                <li key={i.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{i.type}</p>
                    <div className="flex gap-1.5">
                      <SeverityBadge severity={i.severity} />
                      <IncidentStatusBadge status={i.status} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{i.id}</span> · {fmtDateTime(i.occurredAt)}
                  </p>
                  <div className="mt-3 flex gap-1" aria-label={`Progress: ${i.status}`}>
                    {INCIDENT_STAGES.filter((s) => s !== 'Unverified').map((s) => (
                      <span key={s} className={cn('h-1.5 flex-1 rounded-full', INCIDENT_STAGES.indexOf(s) <= idx ? 'bg-primary' : 'bg-muted')} />
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="training" className="mt-4">
        <TrainingCentre app={app} />
      </TabsContent>
    </Tabs>
  )
}

function WarningTip() {
  const [type, setType] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [files, setFiles] = useState(0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!type || title.trim().length < 4 || summary.trim().length < 10) {
      toast.error('Add a type, a title and a short description.')
      return
    }
    try {
      await raiseWarning({
        type,
        title: title.trim(),
        summary: summary.trim(),
        evidenceCount: files,
      })
      setType('')
      setTitle('')
      setSummary('')
      setFiles(0)
      toast.success('Early-warning tip sent confidentially to Command.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the tip.')
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-black">Share an early-warning tip</h2>
        <p className="text-sm text-muted-foreground">
          Seen signs of tension, threats or misinformation before they turn into incidents? Tips go only to Command and are never
          published.
        </p>
      </div>
      <Field label="Type of risk" htmlFor="ewt">
        <NativeSelect id="ewt" placeholder="Select" options={EARLY_WARNING_TYPES} value={type} onChange={(e) => setType(e.target.value)} />
      </Field>
      <Field label="Headline" htmlFor="ewh">
        <Input id="ewh" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Youths being mobilised near the collation centre" />
      </Field>
      <Field label="What have you seen or heard?" htmlFor="ews">
        <Textarea id="ews" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <Field label="Photo / video evidence (optional)" htmlFor="ewf">
        <Input id="ewf" type="file" accept="image/*,video/*" multiple onChange={(e) => setFiles(e.target.files?.length ?? 0)} />
      </Field>
      <Button type="submit">
        <Send /> Send to Command
      </Button>
    </form>
  )
}
