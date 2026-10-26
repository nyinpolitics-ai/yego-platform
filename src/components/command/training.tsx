import { useEffect, useMemo, useState } from 'react'
import { Download, GraduationCap, MessageSquare, Save, Search } from 'lucide-react'
import { toast } from 'sonner'

import { TRAINING_MODULES } from '@/lib/fixtures'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { getTrainingRoster, messageApplicant, setTrainingProgress, type TrainingRosterRow } from '@/lib/demo-store'
import { fmtDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatCard } from './shared'

function certificationTone(value: TrainingRosterRow['certification']) {
  if (value === 'Issued') return 'bg-emerald-100 text-emerald-800'
  if (value === 'Eligible') return 'bg-amber-100 text-amber-800'
  return 'bg-muted text-muted-foreground'
}

export function TrainingView() {
  const [rows, setRows] = useState<TrainingRosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<TrainingRosterRow | null>(null)
  const [progress, setProgress] = useState(0)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await getTrainingRoster()
      setRows(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load the training roster.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    getTrainingRoster()
      .then((data) => {
        if (active) setRows(data)
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : 'Could not load the training roster.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      `${row.fullName} ${row.applicationId} ${row.state} ${row.lga} ${row.status}`.toLowerCase().includes(needle),
    )
  }, [rows, q])

  const completed = rows.filter((row) => row.trainingProgress >= 100).length
  const notStarted = rows.filter((row) => row.trainingProgress === 0).length
  const inProgress = rows.length - completed - notStarted
  const certified = rows.filter((row) => row.certification === 'Issued').length
  const scored = rows.filter((row) => row.assessmentScore != null)
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, row) => sum + (row.assessmentScore ?? 0), 0) / scored.length)
    : null

  function open(row: TrainingRosterRow) {
    setSelected(row)
    setProgress(row.trainingProgress)
    setNote('')
    setMessage('')
  }

  async function saveProgress() {
    if (!selected) return
    setBusy(true)
    try {
      const result = await setTrainingProgress(selected.applicationId, progress, note.trim() || undefined)
      toast.success(`Training progress updated to ${result.progress}%. The applicant has been notified.`)
      setSelected({ ...selected, trainingProgress: result.progress })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update training progress.')
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage() {
    if (!selected) return
    if (message.trim().length < 4) {
      toast.error('Write a message first.')
      return
    }
    setBusy(true)
    try {
      await messageApplicant(selected.applicationId, message.trim(), 'Training update')
      toast.success('Message sent to the applicant’s portal.')
      setMessage('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the message.')
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    const header = ['Application ID', 'Applicant', 'State', 'LGA', 'Status', 'Progress', 'Modules', 'Assessment', 'Certification', 'Last activity']
    const lines = rows.map((row) => [
      row.applicationId,
      row.fullName,
      row.state,
      row.lga,
      row.status,
      `${row.trainingProgress}%`,
      `${row.modulesPassed} of ${TRAINING_MODULES.length}`,
      row.assessmentScore == null ? '' : `${row.assessmentScore}%`,
      row.certification,
      row.lastActivity ? fmtDateTime(row.lastActivity) : '',
    ])
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `yego-training-progress-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Applicants" value={rows.length} />
        <StatCard label="Not started" value={notStarted} tone="warn" />
        <StatCard label="In progress" value={inProgress} />
        <StatCard label="Completed" value={completed} tone="primary" />
        <StatCard label="Certified" value={certified} />
        <StatCard label="Average score" value={averageScore == null ? 'Pending' : `${averageScore}%`} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="relative w-full max-w-sm text-xs font-semibold">
          Search
          <Search className="absolute bottom-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="mt-1 h-9 pl-8"
            placeholder="Name, application ID, state or LGA"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <Button type="button" variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download /> Export progress report
        </Button>
        <Button type="button" variant="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead>Training</TableHead>
              <TableHead className="hidden lg:table-cell">Assessment</TableHead>
              <TableHead>Certification</TableHead>
              <TableHead className="hidden xl:table-cell">Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {loading ? 'Loading training records…' : 'No applicants match this search.'}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((row) => (
              <TableRow key={row.applicationId} className="cursor-pointer" onClick={() => open(row)}>
                <TableCell>
                  <p className="font-semibold">{row.fullName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{row.applicationId}</p>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {row.lga}, {row.state}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={row.trainingProgress} className="h-2 w-20" />
                    <span className="text-xs font-semibold">{row.trainingProgress}%</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{row.modulesPassed} of 9 modules</p>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {row.assessmentScore == null ? 'Pending' : `${row.assessmentScore}%`}
                </TableCell>
                <TableCell>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', certificationTone(row.certification))}>
                    {row.certification}
                  </span>
                </TableCell>
                <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                  {row.lastActivity ? timeAgo(row.lastActivity) : 'Never'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(openState) => !openState && setSelected(null)}>
        <SheetContent className="w-full overflow-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.fullName}</SheetTitle>
                <SheetDescription>
                  {selected.applicationId} · {selected.lga}, {selected.state} · {selected.status}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-8">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Training progress</span>
                    <span className="font-bold">{progress}%</span>
                  </div>
                  <Progress value={progress} className="mt-2" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selected.modulesPassed} of {TRAINING_MODULES.length} modules · assessment {selected.assessmentScore == null ? 'not recorded' : `${selected.assessmentScore}%`} · certification {selected.certification}
                  </p>
                  {selected.lastActivity && (
                    <p className="text-xs text-muted-foreground">Last activity {fmtDateTime(selected.lastActivity)}</p>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <GraduationCap className="size-4 text-primary" /> Record progress
                  </h3>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={progress}
                    onChange={(event) => setProgress(Number(event.target.value))}
                    className="w-full accent-[var(--primary)]"
                    aria-label="Training progress"
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={progress}
                      onChange={(event) => setProgress(Math.max(0, Math.min(100, Number(event.target.value))))}
                      className="h-9 w-24"
                      aria-label="Progress percentage"
                    />
                    <span className="text-sm text-muted-foreground">per cent complete</span>
                  </div>
                  <Textarea
                    rows={3}
                    placeholder="What has the applicant completed, or what is still outstanding?"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <Button onClick={() => void saveProgress()} disabled={busy}>
                    <Save /> Save progress
                  </Button>
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <MessageSquare className="size-4 text-primary" /> Message the applicant
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    The message appears in the applicant’s portal and tells them what to do next.
                  </p>
                  <Textarea
                    rows={3}
                    placeholder="e.g. Module 6 is still outstanding. Complete it before Friday to be eligible for certification."
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <Button variant="secondary" onClick={() => void sendMessage()} disabled={busy}>
                    <MessageSquare /> Send message
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
