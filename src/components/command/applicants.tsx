import { useState } from 'react'
import { ArrowRight, Ban, Lock, MapPin, MessageCircle, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { NativeSelect } from '@/components/yego/fields'
import { AppStatusBadge } from '@/components/yego/status'
import { ApplicationTracker } from '@/components/yego/tracker'
import { assignPollingUnit, messageApplicant, setApplicationStatus, useDB } from '@/lib/demo-store'
import { APPLICATION_STAGES, type Application } from '@/lib/fixtures'
import { fmtDate } from '@/lib/format'
import { can } from '@/lib/permissions'
import { GeoFilters, StatCard, useActor } from './shared'

const STATUS_OPTIONS = [...APPLICATION_STAGES, 'Not Approved'] as const

function initials(n: string) {
  return n.split(' ').map((p) => p[0]).slice(0, 2).join('')
}

export function ApplicantsView({ lockedState }: { lockedState?: string }) {
  const { applications } = useDB()
  const [state, setState] = useState('')
  const [lga, setLga] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const s = lockedState ?? state

  const scoped = applications.filter((a) => !s || a.stateOfResidence === s)
  const list = scoped.filter(
    (a) =>
      (!lga || a.lga === lga) &&
      (!status || a.status === status) &&
      (!q || `${a.fullName} ${a.id} ${a.phone} ${a.yegoId ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  )
  const count = (st: string[]) => scoped.filter((a) => st.includes(a.status)).length
  const current = applications.find((a) => a.id === open)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="New applications" value={count(['Application Submitted'])} tone="warn" />
        <StatCard label="In screening" value={count(['Under Review', 'Screening'])} />
        <StatCard label="Verified / approved" value={count(['Approved', 'Training Required'])} />
        <StatCard label="Trained" value={count(['Training Completed'])} />
        <StatCard label="Active Guards" value={count(['Certified/Active'])} tone="primary" />
      </div>

      <GeoFilters state={state} lga={lga} onState={setState} onLga={setLga} lockedState={lockedState}>
        <label className="w-48 text-xs font-semibold">
          Status
          <NativeSelect className="mt-1 h-9" placeholder="All statuses" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
        </label>
        <label className="relative w-60 text-xs font-semibold">
          Search
          <Search className="absolute bottom-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input className="mt-1 h-9 pl-8" placeholder="Name, ID, phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </GeoFilters>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden lg:table-cell">Polling unit</TableHead>
              <TableHead className="hidden sm:table-cell">Applied</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No applicants match these filters.
                </TableCell>
              </TableRow>
            )}
            {list.map((a) => (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => setOpen(a.id)}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {a.photo ? (
                      <img src={a.photo} alt="" className="size-9 rounded-full object-cover" />
                    ) : (
                      <span className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{initials(a.fullName)}</span>
                    )}
                    <div>
                      <p className="font-semibold">{a.fullName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{a.yegoId ?? a.id}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {a.lga}, {a.stateOfResidence}
                </TableCell>
                <TableCell className="hidden max-w-48 truncate lg:table-cell">{a.pollingUnit}</TableCell>
                <TableCell className="hidden sm:table-cell">{fmtDate(a.submittedAt)}</TableCell>
                <TableCell>
                  <AppStatusBadge status={a.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!current} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-auto sm:max-w-xl">
          {current && <ApplicantProfile app={current} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ApplicantProfile({ app }: { app: Application }) {
  const { role } = useActor()
  const [note, setNote] = useState('')
  const [ward, setWard] = useState(app.ward)
  const [pu, setPu] = useState(app.pollingUnit)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const idx = APPLICATION_STAGES.indexOf(app.status as (typeof APPLICATION_STAGES)[number])
  const next = idx >= 0 && idx < APPLICATION_STAGES.length - 1 ? APPLICATION_STAGES[idx + 1] : undefined
  const nextNeedsApproval = next && APPLICATION_STAGES.indexOf(next) >= APPLICATION_STAGES.indexOf('Approved')
  const canAdvance = next && (nextNeedsApproval ? can(role, 'approve:verification') : can(role, 'screen:applicants'))
  const canAssign = can(role, 'assign:polling-units')

  return (
    <>
      <SheetHeader>
        <SheetTitle>{app.fullName}</SheetTitle>
        <SheetDescription>
          {app.id}
          {app.yegoId && ` · ${app.yegoId}`}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4 pb-8">
        <div className="flex items-center gap-4">
          {app.photo ? (
            <img src={app.photo} alt={`Photo of ${app.fullName}`} className="size-24 rounded-lg object-cover" />
          ) : (
            <span className="grid size-24 place-items-center rounded-lg bg-secondary font-display text-2xl font-black text-secondary-foreground">{initials(app.fullName)}</span>
          )}
          <div className="space-y-1.5 text-sm">
            <AppStatusBadge status={app.status} />
            <p className="flex items-center gap-1.5">
              <MessageCircle className="size-4 text-[#25D366]" /> WhatsApp channel {app.confirmedWhatsApp ? 'confirmed' : 'not confirmed'}
            </p>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              Email {app.emailVerified ? 'verified' : 'verification pending'}
            </p>
            <p>Training: {app.trainingProgress}%</p>
          </div>
        </div>

        <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1.5 rounded-lg border p-4 text-sm">
          {(
            [
              ['Gender', app.gender],
              ['Date of birth', fmtDate(app.dateOfBirth)],
              ['Phone', app.phone],
              ['WhatsApp', app.whatsapp],
              ['Email', app.email],
              ['NIN', `${app.nin} (encrypted)`],
              ['State of origin', app.stateOfOrigin],
              ['Residence', `${app.ward}, ${app.lga}, ${app.stateOfResidence}`],
              ['Polling unit', app.pollingUnit],
              ['Background', app.background],
              ['Experience', app.experience || 'Not provided'],
              ['Declarations', 'Non-partisanship ✓ · Code of conduct ✓ · Data consent ✓'],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-bold">Screening & verification</h3>
          <Input placeholder="Note for audit log (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {next && canAdvance && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void setApplicationStatus(app.id, next, note.trim() || undefined)
                    .then(() => {
                      setNote('')
                      toast.success(`${app.fullName.split(' ')[0]} moved to “${next}”. Their dashboard is updated.`)
                    })
                    .catch((error: unknown) =>
                      toast.error(error instanceof Error ? error.message : 'Could not update the application.'),
                    )
                    .finally(() => setBusy(false))
                }}
              >
                Move to {next} <ArrowRight />
              </Button>
            )}
            {next && !canAdvance && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> Your role cannot move applicants to “{next}”.
              </p>
            )}
            {app.status !== 'Not Approved' && app.status !== 'Certified/Active' && can(role, 'approve:verification') && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  setBusy(true)
                  void setApplicationStatus(app.id, 'Not Approved', note.trim() || undefined)
                    .then(() => toast.success('Application marked Not Approved'))
                    .catch((error: unknown) =>
                      toast.error(error instanceof Error ? error.message : 'Could not update the application.'),
                    )
                    .finally(() => setBusy(false))
                }}
              >
                <Ban /> Not approve
              </Button>
            )}
          </div>
        </section>

        {(can(role, 'screen:applicants') || can(role, 'approve:verification') || can(role, 'manage:training')) && (
          <section className="space-y-3 rounded-lg border border-primary/30 bg-secondary/40 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <MessageCircle className="size-4 text-primary" /> Message the applicant
            </h3>
            <p className="text-xs text-muted-foreground">
              Tell the applicant what they need to carry on: missing documents, screening next steps, training or
              deployment instructions. The message appears in their portal.
            </p>
            <Textarea
              rows={3}
              placeholder="e.g. Your NIN could not be verified. Upload a clearer photograph and confirm your WhatsApp number."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || message.trim().length < 4}
              onClick={() => {
                setBusy(true)
                void messageApplicant(app.id, message.trim(), 'Action needed on your application')
                  .then(() => {
                    setMessage('')
                    toast.success('Message sent to the applicant’s portal.')
                  })
                  .catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : 'Could not send the message.'),
                  )
                  .finally(() => setBusy(false))
              }}
            >
              <MessageCircle /> Send message
            </Button>
          </section>
        )}

        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <MapPin className="size-4" /> Polling-unit assignment
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input aria-label="Ward" value={ward} onChange={(e) => setWard(e.target.value)} disabled={!canAssign} />
            <Input aria-label="Polling unit" value={pu} onChange={(e) => setPu(e.target.value)} disabled={!canAssign} />
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !canAssign || (ward === app.ward && pu === app.pollingUnit)}
            onClick={() => {
              setBusy(true)
              void assignPollingUnit(app.id, ward.trim(), pu.trim())
                .then(() => toast.success('Polling unit assigned'))
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : 'Could not assign the polling unit.'),
                )
                .finally(() => setBusy(false))
            }}
          >
            Save assignment
          </Button>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-bold">Progress & audit</h3>
          <ApplicationTracker app={app} />
          <ol className="mt-4 space-y-1 border-l-2 pl-4 text-xs">
            {[...app.history].reverse().map((h, i) => (
              <li key={h.at + i}>
                <strong>{h.action}</strong> · {h.by} · {fmtDate(h.at)}
                {h.note && <span className="text-muted-foreground"> · “{h.note}”</span>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
