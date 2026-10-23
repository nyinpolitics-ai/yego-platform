import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronUp, Eye, EyeOff, Lock, Radar } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/yego/fields'
import { NigeriaMap } from '@/components/yego/nigeria-map'
import { WARNING_LEVEL_COLOR, WarningLevelBadge } from '@/components/yego/status'
import { publishWarning, resolveWarning, setWarningLevel, useDB } from '@/lib/demo-store'
import type { EarlyWarning } from '@/lib/fixtures'
import { fmtDateTime, mapsLink, timeAgo } from '@/lib/format'
import { can } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { GeoFilters, StatCard, useActor } from './shared'

const ACCESS_LEVELS = ['Command only', 'State coordinators', 'All Guards in area'] as const

function nextLevel(level: EarlyWarning['level']): 'Alert' | 'Urgent' | null {
  if (level === 'Watch') return 'Alert'
  if (level === 'Alert') return 'Urgent'
  return null
}

export function WarningsView({ lockedState }: { lockedState?: string }) {
  const { warnings } = useDB()
  const { role } = useActor()
  const [state, setState] = useState('')
  const [lga, setLga] = useState('')
  const [level, setLevel] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveNote, setResolveNote] = useState('')
  const s = lockedState ?? state
  const canAct = can(role, 'raise:early-warning')

  const list = useMemo(
    () =>
      warnings
        .filter(
          (w) =>
            (!s || w.state === s) &&
            (!lga || w.lga === lga) &&
            (!level || w.level === level) &&
            (showResolved || !w.resolvedAt),
        )
        .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt)),
    [warnings, s, lga, level, showResolved],
  )
  const current = warnings.find((w) => w.id === (sel ?? list[0]?.id)) ?? null

  const open = warnings.filter((w) => !w.resolvedAt && (!s || w.state === s) && (!lga || w.lga === lga))
  const urgent = open.filter((w) => w.level === 'Urgent')
  const alert = open.filter((w) => w.level === 'Alert')
  const resolved = warnings.filter((w) => w.resolvedAt && (!s || w.state === s) && (!lga || w.lga === lga))

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true)
    try {
      await action()
      toast.success(message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That action failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <GeoFilters state={state} lga={lga} onState={setState} onLga={setLga} lockedState={lockedState}>
        <label className="w-40 text-xs font-semibold">
          Level
          <NativeSelect
            className="mt-1 h-9"
            placeholder="All levels"
            options={[...EARLY_WARNING_LEVELS]}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          />
        </label>
        <Button
          size="sm"
          variant={showResolved ? 'secondary' : 'outline'}
          className="h-9"
          onClick={() => setShowResolved((v) => !v)}
        >
          {showResolved ? <EyeOff /> : <Eye />}
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </Button>
      </GeoFilters>

      <section aria-label="Early-warning summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open warnings" value={open.length} tone="primary" />
        <StatCard label="Urgent" value={urgent.length} tone="danger" />
        <StatCard label="Alerts" value={alert.length} tone="warn" />
        <StatCard label="Resolved" value={resolved.length} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul className="max-h-[70vh] divide-y overflow-auto rounded-lg border bg-card">
          {list.length === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">
              No early warnings match. Guards raise tips from the portal; they appear here for triage.
            </li>
          )}
          {list.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => setSel(w.id)}
                className={cn(
                  'flex w-full gap-3 p-3.5 text-left hover:bg-muted',
                  current?.id === w.id && 'bg-secondary',
                )}
              >
                <span
                  className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', w.resolvedAt && 'opacity-40')}
                  style={{ background: WARNING_LEVEL_COLOR[w.level] }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('truncate text-sm font-semibold', w.resolvedAt && 'line-through opacity-70')}>
                      {w.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(w.raisedAt)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {w.id} · {w.type} · {w.lga}, {w.state}
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    <WarningLevelBadge level={w.level} />
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold">
                      {w.access}
                    </span>
                    {w.resolvedAt && (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        Resolved
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {current ? (
          <div className="max-h-[70vh] space-y-4 overflow-auto rounded-lg border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-bold leading-tight">{current.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {current.id} · {current.type} · raised {fmtDateTime(current.raisedAt)} by {current.raisedBy}
                </p>
              </div>
              <WarningLevelBadge level={current.level} />
            </div>

            <p className="rounded-md bg-muted p-3 text-sm leading-relaxed">{current.summary}</p>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">LGA</p>
                <p className="font-medium">{current.lga}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">State</p>
                <p className="font-medium">{current.state}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence files</p>
                <p className="font-medium">{current.evidence || 'None attached'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audience</p>
                <p className="font-medium">{current.access}</p>
              </div>
            </div>

            <NigeriaMap
              className="h-56 rounded-md border"
              focus={{ lat: current.lat, lng: current.lng, zoom: 10 }}
              markers={[
                {
                  id: current.id,
                  lat: current.lat,
                  lng: current.lng,
                  color: WARNING_LEVEL_COLOR[current.level],
                  radius: 9,
                  popup: `<b>${current.level}: ${current.title}</b><br/>${current.lga}, ${current.state}`,
                },
              ]}
            />
            <p className="text-right text-xs text-muted-foreground">
              <a
                className="font-semibold text-primary hover:underline"
                href={mapsLink(current.lat, current.lng)}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps
              </a>
            </p>

            {current.resolvedAt ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="size-4" /> Resolved {fmtDateTime(current.resolvedAt)}
                </p>
                {current.resolutionNote && <p className="mt-1">{current.resolutionNote}</p>}
              </div>
            ) : canAct ? (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                {nextLevel(current.level) && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      const target = nextLevel(current.level)
                      if (!target) return
                      void run(() => setWarningLevel(current.id, target), `Warning escalated to ${target}.`)
                    }}
                  >
                    <ChevronUp /> Escalate to {nextLevel(current.level)}
                  </Button>
                )}
                <label className="text-xs font-semibold">
                  Publish to
                  <NativeSelect
                    className="mt-0.5 h-9 w-52"
                    value={current.access}
                    disabled={busy}
                    onChange={(e) => {
                      const access = e.target.value as (typeof ACCESS_LEVELS)[number]
                      if (access === current.access) return
                      void run(() => publishWarning(current.id, access), `Audience set to “${access}”.`)
                    }}
                    options={[...ACCESS_LEVELS]}
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setResolveNote('')
                    setResolveOpen(true)
                  }}
                >
                  <CheckCircle2 /> Resolve
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> Your role can read the early-warning board but cannot change warnings.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
            <Radar className="mx-auto size-8 opacity-40" />
            <p className="mt-2">Select an early warning</p>
          </div>
        )}
      </div>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve warning {current?.id}</DialogTitle>
            <DialogDescription>
              Resolving closes the warning on the board. The note is kept in the audit log.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder="What happened? e.g. Monitored for 48h — no further reports; community meeting held."
            maxLength={2000}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (!current) return
                void run(async () => {
                  await resolveWarning(current.id, resolveNote.trim() || undefined)
                  setResolveOpen(false)
                }, 'Warning resolved.')
              }}
            >
              Resolve warning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const EARLY_WARNING_LEVELS = ['Watch', 'Alert', 'Urgent'] as const
