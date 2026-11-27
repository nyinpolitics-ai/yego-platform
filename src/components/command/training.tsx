import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, GraduationCap, MessageSquare, Save, Search } from 'lucide-react'
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
import {
  exportTrainingRosterCsv,
  getTrainingRosterPage,
  messageApplicant,
  setTrainingProgress,
  useDB,
  type TrainingRosterPage,
  type TrainingRosterRow,
} from '@/lib/demo-store'
import { fmtDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatCard } from './shared'

function certificationTone(value: TrainingRosterRow['certification']) {
  if (value === 'Issued') return 'bg-emerald-100 text-emerald-800'
  if (value === 'Eligible') return 'bg-amber-100 text-amber-800'
  return 'bg-muted text-muted-foreground'
}

export function TrainingView() {
  const { applications } = useDB() // change signal: mutations refresh the bootstrap snapshot
  const [data, setData] = useState<TrainingRosterPage | null>(null)
  const [loadedKey, setLoadedKey] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 25
  const [selected, setSelected] = useState<TrainingRosterRow | null>(null)
  const [progress, setProgress] = useState(0)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  const listKey = `${page}|${pageSize}|${debouncedQ.trim()}`
  const loading = loadedKey !== listKey

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  async function load() {
    const result = await getTrainingRosterPage({ page, pageSize, q: debouncedQ.trim() || undefined })
    setData(result)
    setLoadedKey(`${page}|${pageSize}|${debouncedQ.trim()}`)
    return result
  }

  useEffect(() => {
    let active = true
    getTrainingRosterPage({ page, pageSize, q: debouncedQ.trim() || undefined })
      .then((result) => {
        if (active) {
          setData(result)
          setLoadedKey(listKey)
        }
      })
      .catch((error) => {
        if (active) {
          toast.error(error instanceof Error ? error.message : 'Could not load the training roster.')
          setLoadedKey(listKey)
        }
      })
    return () => {
      active = false
    }
    // `applications` identity changes after every demo-store mutation (refresh()).
  }, [listKey, page, pageSize, debouncedQ, applications])

  const stats = data?.stats
  const rows = data?.rows ?? []

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

  async function exportCsv() {
    setExporting(true)
    try {
      // The export is built server-side from the full filtered roster (not just
      // the visible page) and respects the caller's geographic scope.
      const csv = await exportTrainingRosterCsv(debouncedQ.trim() || undefined)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `yego-training-progress-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export the roster.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Applicants" value={stats?.applicants ?? 0} />
        <StatCard label="Not started" value={stats?.notStarted ?? 0} tone="warn" />
        <StatCard label="In progress" value={stats?.inProgress ?? 0} />
        <StatCard label="Completed" value={stats?.completed ?? 0} tone="primary" />
        <StatCard label="Certified" value={stats?.certified ?? 0} />
        <StatCard label="Average score" value={stats ? (stats.averageScore == null ? 'Pending' : `${stats.averageScore}%`) : '—'} />
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
        <Button type="button" variant="outline" onClick={() => void exportCsv()} disabled={!rows.length || exporting}>
          <Download /> {exporting ? 'Preparing…' : 'Export progress report'}
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
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Loading training records…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No applicants match this search.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((row) => (
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

      {data && data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            Showing{' '}
            <strong className="text-foreground">
              {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)}
            </strong>{' '}
            of <strong className="text-foreground">{data.total}</strong> applicants on the roster
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={data.page <= 1 || loading} onClick={() => setPage(data.page - 1)}>
              <ChevronLeft /> Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {data.page} of {data.pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={data.page >= data.pageCount || loading} onClick={() => setPage(data.page + 1)}>
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}

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
