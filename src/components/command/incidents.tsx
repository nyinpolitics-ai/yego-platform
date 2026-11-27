import { useState } from 'react'
import {
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Forward,
  HelpCircle,
  History,
  Loader2,
  Lock,
  MapPin,
  Play,
  RotateCcw,
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
import {
  addIncidentNote,
  getEvidenceViewTicket,
  referIncident,
  setIncidentStatus,
  useDB,
  type EvidenceViewTicket,
} from '@/lib/demo-store'
import { getEvidenceFileFn } from '@/server/functions'
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
          <EvidenceList incidentId={inc.id} evidence={inc.evidence} />
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

/* Evidence viewing -----------------------------------------------------------
 * Attachments live in private storage. Opening one asks the server for a
 * short-lived signed token (authorization + geographic scope enforced), then
 * streams the bytes through an authenticated endpoint. Links expire after 10
 * minutes and can be refreshed at any time. Storage keys never reach the UI. */

type EvidenceLoad =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable'; reason: string }
  | { status: 'ready'; ticket: EvidenceViewTicket; url: string }

function evidenceStreamUrl(ticket: EvidenceViewTicket): string {
  const base = (getEvidenceFileFn as unknown as { url: string }).url
  return `${base}?id=${encodeURIComponent(ticket.evidenceId)}&exp=${ticket.exp}&sig=${encodeURIComponent(ticket.sig ?? '')}`
}

function formatEvidenceSize(bytes?: number): string {
  if (bytes == null) return ''
  if (bytes >= 1024 * 1024) return ` · ${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return ` · ${Math.round(bytes / 1024)} kB`
  return ''
}

function EvidenceList({ incidentId, evidence }: { incidentId: string; evidence: Incident['evidence'] }) {
  const [loads, setLoads] = useState<Record<string, EvidenceLoad>>({})
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)

  function setLoad(id: string, load: EvidenceLoad) {
    setLoads((prev) => ({ ...prev, [id]: load }))
  }

  async function open(item: Incident['evidence'][number]) {
    setLoad(item.id, { status: 'loading' })
    try {
      const ticket = await getEvidenceViewTicket(incidentId, item.id)
      if (ticket.unavailable) {
        setLoad(item.id, { status: 'unavailable', reason: ticket.reason ?? 'The original attachment is unavailable.' })
        return
      }
      setLoad(item.id, { status: 'ready', ticket, url: evidenceStreamUrl(ticket) })
    } catch (error) {
      setLoad(item.id, {
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not open the attachment.',
      })
    }
  }

  return (
    <div className="space-y-2">
      <ul className="grid gap-2 sm:grid-cols-2">
        {evidence.map((item) => {
          const load = loads[item.id] ?? { status: 'idle' as const }
          const playable = item.mimeType?.startsWith('video/')
          const isImage = item.mimeType?.startsWith('image/')
          return (
            <li key={item.id} className="rounded-md border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {item.kind === 'photo' ? (
                      <Camera className="size-4 text-primary" />
                    ) : item.kind === 'video' ? (
                      <Video className="size-4 text-primary" />
                    ) : (
                      <FileText className="size-4 text-primary" />
                    )}
                    <span className="truncate" title={item.name}>
                      {item.name}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.mimeType ?? item.kind}
                    {formatEvidenceSize(item.byteSize)}
                    {' · private evidence'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!item.hasFile ? (
                    <span className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                      <Lock className="size-3" /> No stored file
                    </span>
                  ) : load.status === 'loading' ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> Opening…
                    </span>
                  ) : load.status === 'ready' && isImage ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setPreview({ url: load.url, name: item.name })}>
                        <ExternalLink /> View
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Refresh link" onClick={() => void open(item)}>
                        <RotateCcw />
                      </Button>
                    </>
                  ) : load.status === 'ready' && playable ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setLoad(item.id, { status: 'idle' })}>
                        <XCircle /> Hide
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Refresh link" onClick={() => void open(item)}>
                        <RotateCcw />
                      </Button>
                    </>
                  ) : load.status === 'ready' ? (
                    <>
                      <Button asChild size="sm" variant="outline">
                        <a href={load.url} target="_blank" rel="noopener noreferrer">
                          <Download /> Open
                        </a>
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Refresh link" onClick={() => void open(item)}>
                        <RotateCcw />
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void open(item)}>
                      {isImage ? (
                        <>
                          <Play /> Preview
                        </>
                      ) : playable ? (
                        <>
                          <Play /> Play
                        </>
                      ) : (
                        <>
                          <Download /> Open
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {item.hasFile && load.status === 'idle' && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Press {isImage ? '“Preview”' : playable ? '“Play”' : '“Open”'} to stream the original file through a
                  short-lived, access-checked link.
                </p>
              )}
              {load.status === 'unavailable' && (
                <p className="mt-2 flex items-start gap-1.5 rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                  <HelpCircle className="mt-0.5 size-3.5 shrink-0" />
                  Original attachment unavailable: {load.reason} The report text remains the authoritative record.
                </p>
              )}
              {load.status === 'error' && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  <span>{load.message}</span>
                  <Button size="sm" variant="ghost" onClick={() => void open(item)}>
                    <RotateCcw /> Try again
                  </Button>
                </div>
              )}
              {load.status === 'ready' && playable && (
                <video
                  key={load.url}
                  controls
                  preload="metadata"
                  className="mt-2 w-full rounded-md border bg-black"
                  onError={() =>
                    setLoad(item.id, {
                      status: 'error',
                      message: 'The link expired or this video format cannot play in the browser. Use refresh or “Open”.',
                    })
                  }
                >
                  <source src={load.url} type={item.mimeType ?? 'video/mp4'} />
                </video>
              )}
              {load.status === 'ready' && isImage && (
                <img
                  key={load.url}
                  src={load.url}
                  alt={`Evidence: ${item.name}`}
                  className="mt-2 max-h-40 w-full rounded-md border object-cover"
                  onError={() =>
                    setLoad(item.id, { status: 'error', message: 'The secure link expired. Press refresh to reopen.' })
                  }
                />
              )}
            </li>
          )
        })}
      </ul>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Evidence preview</DialogTitle>
            <DialogDescription className="truncate">{preview?.name}</DialogDescription>
          </DialogHeader>
          {preview && <img src={preview.url} alt={`Evidence: ${preview.name}`} className="w-full rounded-md border" />}
          <DialogFooter>
            {preview && (
              <Button asChild variant="outline">
                <a href={preview.url} target="_blank" rel="noopener noreferrer">
                  <Download /> Open in new tab
                </a>
              </Button>
            )}
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
