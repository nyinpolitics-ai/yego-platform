import { useEffect, useState } from 'react'
import { Plus, Send, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EvidenceUploader } from '@/components/yego/evidence-uploader'
import { Field, NativeSelect } from '@/components/yego/fields'
import { INCIDENT_TYPES } from '@/lib/fixtures'
import { listPollingUnits, reportIncident, type IncidentEvidenceUpload } from '@/lib/demo-store'
import { STATES, getState } from '@/lib/nigeria'
import { useWards } from '@/lib/wards'

const PU_DEFAULT = 'To be assigned'

function localNow() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

export function ReportIncidentDialog({ lockedState }: { lockedState?: string }) {
  const [open, setOpen] = useState(false)
  const [stateName, setStateName] = useState(lockedState ?? '')
  const [lga, setLga] = useState('')
  const [ward, setWard] = useState('')
  const [pollingUnit, setPollingUnit] = useState(PU_DEFAULT)
  const [type, setType] = useState('')
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium')
  const [description, setDescription] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => localNow())
  const [electionDay, setElectionDay] = useState(false)
  const [evidence, setEvidence] = useState<IncidentEvidenceUpload[]>([])
  const [pendingUploads, setPendingUploads] = useState(0)
  const [units, setUnits] = useState<{ code: string; name: string; ward: string }[]>([])
  const [busy, setBusy] = useState(false)
  const wards = useWards()

  const lgas = getState(stateName)?.lgas ?? []
  const wardOptions = wards?.[stateName]?.[lga] ?? []
  const unitOptions = [
    PU_DEFAULT,
    ...units.map((unit) => {
      const otherWard = unit.ward && unit.ward.toLowerCase() !== ward.toLowerCase()
      return `${unit.code} · ${unit.name}${otherWard ? ` (${unit.ward})` : ''}`
    }),
  ]

  useEffect(() => {
    if (!stateName || !lga || !ward) return
    let active = true
    listPollingUnits(stateName, lga, ward)
      .then((rows) => {
        if (active) setUnits(rows)
      })
      .catch(() => {
        if (active) setUnits([])
      })
    return () => {
      active = false
    }
  }, [stateName, lga, ward])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!stateName || !lga || !ward || !type || description.trim().length < 3) {
      toast.error('Complete the location, incident type and description.')
      return
    }
    setBusy(true)
    try {
      const incident = await reportIncident({
        state: stateName,
        lga,
        ward,
        pollingUnit: pollingUnit === PU_DEFAULT ? undefined : pollingUnit,
        type,
        severity,
        description: description.trim(),
        occurredAt: new Date(occurredAt).toISOString(),
        electionDay,
        evidence,
      })
      toast.success(`Incident ${incident.id} recorded and sent to the verification queue.`)
      setOpen(false)
      setType('')
      setDescription('')
      setOccurredAt(localNow())
      setElectionDay(false)
      setPollingUnit(PU_DEFAULT)
      setEvidence([])
      setPendingUploads(0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record the incident.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Report incident
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" /> Report an incident
          </DialogTitle>
          <DialogDescription>
            Record a report on behalf of the field team. It enters the ERART verification queue and can be forwarded to
            any of the 11 response agencies after verification.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="State" htmlFor="ri-state">
              <NativeSelect
                id="ri-state"
                placeholder="Select state"
                options={lockedState ? [lockedState] : STATES.map((item) => item.name)}
                value={stateName}
                disabled={!!lockedState}
                onChange={(event) => {
                  setStateName(event.target.value)
                  setLga('')
                  setWard('')
                  setPollingUnit(PU_DEFAULT)
                  setUnits([])
                }}
              />
            </Field>
            <Field label="LGA" htmlFor="ri-lga">
              <NativeSelect
                id="ri-lga"
                placeholder={stateName ? 'Select LGA' : 'Select state first'}
                options={lgas}
                value={lga}
                disabled={!stateName}
                onChange={(event) => {
                  setLga(event.target.value)
                  setWard('')
                  setPollingUnit(PU_DEFAULT)
                  setUnits([])
                }}
              />
            </Field>
            <Field label="Ward" htmlFor="ri-ward" hint={wards ? `${wardOptions.length} wards` : 'Loading wards…'}>
              <NativeSelect
                id="ri-ward"
                placeholder={lga ? 'Select ward' : 'Select LGA first'}
                options={wardOptions}
                value={ward}
                disabled={!lga || !wards}
                onChange={(event) => {
                  setWard(event.target.value)
                  setPollingUnit(PU_DEFAULT)
                  setUnits([])
                }}
              />
            </Field>
            <Field label="Polling unit" htmlFor="ri-pu">
              <NativeSelect
                id="ri-pu"
                options={unitOptions}
                value={pollingUnit}
                onChange={(event) => setPollingUnit(event.target.value)}
              />
            </Field>
            <Field label="Incident type" htmlFor="ri-type">
              <NativeSelect
                id="ri-type"
                placeholder="Select type"
                options={[...INCIDENT_TYPES]}
                value={type}
                onChange={(event) => setType(event.target.value)}
              />
            </Field>
            <Field label="Severity" htmlFor="ri-severity">
              <NativeSelect
                id="ri-severity"
                options={['Low', 'Medium', 'High', 'Critical']}
                value={severity}
                onChange={(event) => setSeverity(event.target.value as typeof severity)}
              />
            </Field>
          </div>

          <Field label="What happened?" htmlFor="ri-description">
            <Textarea
              id="ri-description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Who, what, where, how many people, and what response is needed."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="When did it happen?" htmlFor="ri-when">
              <Input
                id="ri-when"
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 self-end rounded-md border p-3 text-sm">
              <Checkbox checked={electionDay} onCheckedChange={(value) => setElectionDay(value === true)} />
              This happened on election day
            </label>
          </div>

          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            The report is stamped with your name and role. After verification, open the incident and use “Forward to
            agency” to send it to INEC, NPF, ICCES, DSS, NSCDC, EFCC, ICPC, NHRC, NOA, NEMA or the Nigerian Army.
          </p>

          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="text-sm font-bold">Evidence (optional)</h3>
            <p className="text-xs text-muted-foreground">
              Attach photos, videos or PDF documents to support this report. Evidence uploads straight to private
              storage and is only visible to authorized officers.
            </p>
            <EvidenceUploader value={evidence} onChange={setEvidence} onPendingChange={setPendingUploads} />
            {pendingUploads > 0 && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Please wait until every attachment finishes uploading before recording the report.
              </p>
            )}
          </section>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || pendingUploads > 0}>
              <Send /> {busy ? 'Recording…' : pendingUploads > 0 ? 'Uploading evidence…' : 'Record report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
