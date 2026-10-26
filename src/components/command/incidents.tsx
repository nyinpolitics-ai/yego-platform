import { useState } from 'react'
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  Forward,
  HelpCircle,
  History,
  Lock,
  MapPin,
  Search,
  Video,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/yego/fields'
import { NigeriaMap } from '@/components/yego/nigeria-map'
import { IncidentStatusBadge, SEVERITY_COLOR, SeverityBadge } from '@/components/yego/status'
import { addIncidentNote, referIncident, setIncidentStatus, useDB } from '@/lib/demo-store'
import { AGENCIES, INCIDENT_STAGES, type Incident } from '@/lib/fixtures'
import { fmtDateTime, mapsLink, timeAgo } from '@/lib/format'
import { can } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { GeoFilters, useActor } from './shared'
import { ReportIncidentDialog } from './report-incident'

const CATEGORIES = [
  'Electoral offence',
  'Violence & security',
  'Logistics / technology',
  'Observer access',
  'Misinformation',
  'Human rights',
  'Other',
]

export function IncidentsView({ lockedState }: { lockedState?: string }) {
  const { incidents } = useDB()
  const { role } = useActor()
  const [state, setState] = useState('')
  const [lga, setLga] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const s = lockedState ?? state

  const list = incidents
    .filter(
      (i) =>
        (!s || i.state === s) &&
        (!lga || i.lga === lga) &&
        (!status || i.status === status) &&
        (!q || `${i.id} ${i.type} ${i.pollingUnit} ${i.reporter}`.toLowerCase().includes(q.toLowerCase())),
    )
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
  const current = incidents.find((i) => i.id === (sel ?? list[0]?.id))

  return (
    <div className="space-y-4">
      {can(role, 'report:incidents') && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ReportIncidentDialog lockedState={lockedState} />
        </div>
      )}
      <GeoFilters state={state} lga={lga} onState={setState} onLga={setLga} lockedState={lockedState}>
        <label className="w-44 text-xs font-semibold">
          Status
          <NativeSelect className="mt-1 h-9" placeholder="All statuses" options={INCIDENT_STAGES} value={status} onChange={(e) => setStatus(e.target.value)} />
        </label>
        <label className="relative w-56 text-xs font-semibold">
          Search
          <Search className="absolute bottom-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input className="mt-1 h-9 pl-8" placeholder="ID, type, PU, reporter" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </GeoFilters>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul className="max-h-[75vh] divide-y overflow-auto rounded-lg border bg-card">
          {list.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No incidents match.</li>}
          {list.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setSel(i.id)}
                className={cn('flex w-full gap-3 p-3.5 text-left hover:bg-muted', current?.id === i.id && 'bg-secondary')}
              >
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[i.severity] }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{i.type}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(i.reportedAt)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.id} · {i.lga}, {i.state}
                  </span>
                  <span className="mt-1.5 flex gap-1.5">
                    <SeverityBadge severity={i.severity} />
                    <IncidentStatusBadge status={i.status} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {current ? <IncidentDetail inc={current} key={current.id} /> : <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">Select an incident</div>}
      </div>
    </div>
  )
}

function IncidentDetail({ inc }: { inc: Incident }) {
  const { role } = useActor()
  const canVerify = can(role, 'verify:incidents')
  const canRefer = can(role, 'refer:incidents')
  const [category, setCategory] = useState(inc.category ?? '')
  const [note, setNote] = useState('')
  const [referOpen, setReferOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function act(s: Incident['status'], msg: string) {
    setBusy(true)
    try {
      await setIncidentStatus(inc.id, s, note.trim() || undefined, category || undefined)
      setNote('')
      toast.success(msg)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the incident.')
    } finally {
      setBusy(false)
    }
  }

  async function requestClarification() {
    setBusy(true)
    try {
      await addIncidentNote(inc.id, 'Clarification requested', note.trim() || 'Reporter asked for more detail.')
      setNote('')
      toast.success(`Clarification request sent to ${inc.reporter}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not request clarification.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{inc.id}{inc.electionDay && ' · Election-Day Mode'}</p>
          <h2 className="text-lg font-black">{inc.type}</h2>
          <p className="text-sm text-muted-foreground">
            {inc.pollingUnit} · {inc.ward}, {inc.lga}, {inc.state}
          </p>
        </div>
        <div className="flex gap-1.5">
          <SeverityBadge severity={inc.severity} />
          <IncidentStatusBadge status={inc.status} />
        </div>
      </header>

      <div className="flex flex-wrap gap-1" aria-label="Workflow">
        {INCIDENT_STAGES.map((st) => (
          <span key={st} className={cn('rounded px-2 py-1 text-[11px] font-semibold', st === inc.status ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
            {st}
          </span>
        ))}
      </div>

      <p className="rounded-lg bg-muted p-3 text-sm">{inc.description}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Occurred</dt>
          <dd>{fmtDateTime(inc.occurredAt)}</dd>
          <dt className="text-muted-foreground">Reported</dt>
          <dd>{fmtDateTime(inc.reportedAt)}</dd>
          <dt className="text-muted-foreground">Reporter</dt>
          <dd>
            {inc.reporter} <span className="font-mono text-xs text-muted-foreground">{inc.reporterId}</span>
          </dd>
          <dt className="text-muted-foreground">Location</dt>
          <dd>
            <a href={mapsLink(inc.lat, inc.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
              <MapPin className="size-3" /> {inc.lat.toFixed(5)}, {inc.lng.toFixed(5)} <ExternalLink className="size-3" />
            </a>
          </dd>
          <dt className="text-muted-foreground">Category</dt>
          <dd>{inc.category ?? 'Not specified'}</dd>
          <dt className="text-muted-foreground">Referred to</dt>
          <dd>{inc.referrals.length ? inc.referrals.map((r) => r.agency).join(', ') : 'None'}</dd>
        </dl>
        <NigeriaMap
          className="h-44"
          showSearch={false}
          focus={{ lat: inc.lat, lng: inc.lng, zoom: 15 }}
          markers={[{ id: inc.id, lat: inc.lat, lng: inc.lng, color: SEVERITY_COLOR[inc.severity], radius: 10 }]}
        />
      </div>

      <section>
        <h3 className="text-sm font-bold">Evidence ({inc.evidence.length})</h3>
        {inc.evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence attached.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {inc.evidence.map((e) => (
              <li key={e.name} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                {e.kind === 'photo' ? <Camera className="size-4" /> : e.kind === 'video' ? <Video className="size-4" /> : <FileText className="size-4" />}
                {e.name}
                <Lock className="size-3 text-muted-foreground" aria-label="Restricted" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {canVerify || canRefer ? (
        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-bold">Verification actions</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">
              Categorise
              <NativeSelect className="mt-1 h-9" placeholder="Select category" options={CATEGORIES} value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
            <label className="text-xs font-semibold">
              Officer note (added to audit trail)
              <Textarea className="mt-1 min-h-9" rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <div className={cn('flex flex-wrap gap-2', busy && 'pointer-events-none opacity-60')}>
            {canVerify && inc.status === 'Reported' && (
              <Button size="sm" variant="secondary" onClick={() => void act('Received', 'Marked as received')}>
                Acknowledge receipt
              </Button>
            )}
            {canVerify && ['Reported', 'Received'].includes(inc.status) && (
              <Button size="sm" variant="secondary" onClick={() => void act('Under Review', 'Review started')}>
                Start review
              </Button>
            )}
            {canVerify && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void requestClarification()}
              >
                <HelpCircle /> Request clarification
              </Button>
            )}
            {canVerify && ['Reported', 'Received', 'Under Review', 'Unverified'].includes(inc.status) && (
              <Button size="sm" onClick={() => void act('Verified', 'Incident verified')}>
                <CheckCircle2 /> Verify
              </Button>
            )}
            {canVerify && ['Reported', 'Received', 'Under Review'].includes(inc.status) && (
              <Button size="sm" variant="outline" onClick={() => void act('Unverified', 'Marked unverified')}>
                <XCircle /> Unverified
              </Button>
            )}
            {canRefer && ['Verified', 'Referred/Actioned'].includes(inc.status) && (
              <Button size="sm" className="bg-ink text-ink-foreground hover:bg-ink/90" onClick={() => setReferOpen(true)}>
                <Forward /> Forward to agency
              </Button>
            )}
            {canVerify && inc.status !== 'Closed' && ['Verified', 'Unverified', 'Referred/Actioned'].includes(inc.status) && (
              <Button size="sm" variant="ghost" onClick={() => void act('Closed', 'Case closed')}>
                Close case
              </Button>
            )}
          </div>
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          <Lock className="size-4" /> Your role can view incidents but not change their status.
        </p>
      )}

      <section>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <History className="size-4" /> Audit trail
        </h3>
        <ol className="mt-2 space-y-2 border-l-2 pl-4">
          {[...inc.audit].reverse().map((a, i) => (
            <li key={a.at + i} className="text-sm">
              <p>
                <strong>{a.action}</strong> · <span className="text-muted-foreground">{a.by}</span>
              </p>
              <p className="text-xs text-muted-foreground">{fmtDateTime(a.at)}</p>
              {a.note && <p className="text-xs">“{a.note}”</p>}
            </li>
          ))}
        </ol>
      </section>

      <ReferDialog inc={inc} open={referOpen} onOpenChange={setReferOpen} />
    </article>
  )
}

function ReferDialog({ inc, open, onOpenChange }: { inc: Incident; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const toggle = (c: string) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Forward {inc.id} for rapid response</DialogTitle>
          <DialogDescription>
            Choose the responsible agencies. A secure referral pack (summary, location, severity, verified evidence) is logged in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {AGENCIES.map((a) => (
            <button
              key={a.code}
              type="button"
              onClick={() => toggle(a.code)}
              aria-pressed={picked.includes(a.code)}
              className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors', picked.includes(a.code) ? 'border-primary bg-secondary ring-2 ring-primary/30' : 'hover:bg-muted')}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full text-[10px] font-black text-white" style={{ background: a.color }}>
                {a.code}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight">{a.name}</span>
                <span className="block text-xs text-muted-foreground">{a.remit}</span>
                <span className="block text-xs font-medium">{a.contact}</span>
              </span>
            </button>
          ))}
        </div>
        <Textarea placeholder="Message to agencies (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!picked.length || busy}
            onClick={() => {
              setBusy(true)
              void referIncident(inc.id, picked, note.trim() || undefined)
                .then(() => {
                  toast.success(`Referral recorded for ${picked.join(', ')}`)
                  setPicked([])
                  setNote('')
                  onOpenChange(false)
                })
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : 'Could not record the referral.'),
                )
                .finally(() => setBusy(false))
            }}
          >
            <Forward /> Forward to {picked.length || ''} {picked.length === 1 ? 'agency' : 'agencies'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
