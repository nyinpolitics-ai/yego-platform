import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  MapPin,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EvidenceUploader } from '@/components/yego/evidence-uploader'
import { NigeriaMap, type PickedPoint } from '@/components/yego/nigeria-map'
import { submitIncident, type IncidentEvidenceUpload } from '@/lib/demo-store'
import {
  INCIDENT_TYPES,
  type Application,
  type Incident,
  type Severity,
} from '@/lib/fixtures'
import { mapsLink } from '@/lib/format'
import { getState } from '@/lib/nigeria'
import { cn } from '@/lib/utils'

const STEPS = ['Where?', 'What happened?', 'When?', 'Evidence?'] as const
const SEVERITIES: { v: Severity; hint: string }[] = [
  { v: 'Low', hint: 'Irregularity, no risk' },
  { v: 'Medium', hint: 'Disrupts voting' },
  { v: 'High', hint: 'Offence / intimidation' },
  { v: 'Critical', hint: 'Violence / danger to life' },
]

function localNow() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function QuickReport({ guard }: { guard: Application }) {
  const st = getState(guard.stateOfResidence)
  const [step, setStep] = useState(0)
  const [point, setPoint] = useState<PickedPoint | null>(null)
  const [focus, setFocus] = useState(st ? { lat: st.lat, lng: st.lng, zoom: 11 } : null)
  const [locating, setLocating] = useState(false)
  const [type, setType] = useState('')
  const [severity, setSeverity] = useState<Severity>('Medium')
  const [description, setDescription] = useState('')
  const [when, setWhen] = useState(() => localNow())
  const [evidence, setEvidence] = useState<IncidentEvidenceUpload[]>([])
  const [pendingUploads, setPendingUploads] = useState(0)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Incident | null>(null)


  function gps() {
    if (!navigator.geolocation) return toast.error('GPS not available on this device.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        const gp = { lat: p.coords.latitude, lng: p.coords.longitude }
        setPoint({ ...gp, label: `GPS ±${Math.round(p.coords.accuracy)}m` })
        setFocus({ ...gp, zoom: 16 })
      },
      () => {
        setLocating(false)
        toast.error('Could not get GPS. Tap your location on the map instead.')
      },
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  const canNext = [!!point, !!type, !!when, true][step]

  async function submit() {
    setBusy(true)
    try {
      const inc = await submitIncident({
        type,
        description: description.trim() || type,
        severity,
        lat: point!.lat,
        lng: point!.lng,
        occurredAt: new Date(when).toISOString(),
        evidence,
        electionDay: true,
      })
      setDone(inc)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the report.')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setStep(0)
    setType('')
    setSeverity('Medium')
    setDescription('')
    setEvidence([])
    setPendingUploads(0)
    setWhen(localNow())
    setDone(null)
  }

  if (done) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto size-12 text-primary" />
        <h3 className="mt-3 text-xl font-black">Report sent to Command</h3>
        <p className="mt-1 text-sm text-muted-foreground">A verification officer will review it. You can track it under “My reports”.</p>
        <div className="mx-auto mt-4 flex max-w-xs items-center justify-between rounded-lg border-2 border-dashed border-primary bg-secondary px-4 py-2">
          <span className="font-mono font-bold">{done.id}</span>
          <Button size="icon-sm" variant="ghost" aria-label="Copy incident ID" onClick={() => { void navigator.clipboard?.writeText(done.id); toast.success('Copied') }}>
            <Copy />
          </Button>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Report another</Button>
          <Button variant="outline" asChild>
            <a href={mapsLink(done.lat, done.lng)} target="_blank" rel="noopener noreferrer">
              <MapPin /> Shared location
            </a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b p-3">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            disabled={i > step}
            onClick={() => setStep(i)}
            className={cn(
              'flex-1 rounded-md px-2 py-2 text-xs font-bold sm:text-sm',
              i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-6">
        {step === 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p>
                <strong>{guard.pollingUnit}</strong>
                <span className="text-muted-foreground"> · {guard.ward}, {guard.lga}</span>
              </p>
              <Button size="sm" onClick={gps} disabled={locating}>
                {locating ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <MapPin />} Use my GPS
              </Button>
            </div>
            <NigeriaMap
              className="h-72 sm:h-80"
              picked={point}
              onPick={setPoint}
              focus={focus}
            />
            <p className="text-xs text-muted-foreground">
              {point
                ? `📍 ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}${point.label ? ` · ${point.label}` : ''}`
                : 'Tap “Use my GPS” or tap the map to mark the exact spot.'}
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn('rounded-lg border p-3 text-left text-sm font-semibold transition-colors', type === t ? 'border-primary bg-secondary ring-2 ring-primary/30' : 'hover:bg-muted')}
                >
                  {t}
                </button>
              ))}
            </div>
            <fieldset>
              <legend className="text-sm font-semibold">Severity</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SEVERITIES.map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setSeverity(s.v)}
                    className={cn(
                      'rounded-lg border p-2.5 text-left',
                      severity === s.v && (s.v === 'Critical' ? 'border-red-600 bg-red-600 text-white' : 'border-primary bg-secondary ring-2 ring-primary/30'),
                    )}
                  >
                    <span className="block text-sm font-bold">{s.v}</span>
                    <span className={cn('block text-xs', severity === s.v && s.v === 'Critical' ? 'text-white/80' : 'text-muted-foreground')}>{s.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="desc" className="text-sm font-semibold">
                Short description <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea id="desc" rows={3} className="mt-1.5" placeholder="Who, what, how many people…" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-sm space-y-3">
            <label htmlFor="when" className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4" /> When did it happen?
            </label>
            <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <Button type="button" variant="outline" size="sm" onClick={() => setWhen(localNow())}>
              Happening now
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Only capture evidence if it is safe to do so. Your safety comes first.</p>
            <EvidenceUploader value={evidence} onChange={setEvidence} onPendingChange={setPendingUploads} />
            {pendingUploads > 0 && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Please wait until every attachment finishes uploading before you send the report.
              </p>
            )}
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">Summary</p>
              <p className="text-muted-foreground">
                {type} · {severity} · {when.replace('T', ' ')} · {point?.lat.toFixed(4)}, {point?.lng.toFixed(4)}
                {evidence.length > 0 && ` · ${evidence.length} attachment${evidence.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-3">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ArrowLeft /> Back
          </Button>
          {step < 3 ? (
            <Button size="lg" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Next <ArrowRight />
            </Button>
          ) : (
            <Button
              size="lg"
              variant={severity === 'Critical' ? 'destructive' : 'default'}
              disabled={busy || pendingUploads > 0}
              onClick={() => void submit()}
            >
              {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Send />} Send report
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
