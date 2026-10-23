import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock, RefreshCw, ScrollText, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NigeriaMap } from '@/components/yego/nigeria-map'
import { getCoverage, type CoverageData } from '@/lib/demo-store'
import { fmtDateTime, nf, timeAgo } from '@/lib/format'
import { getState, TOTALS } from '@/lib/nigeria'
import { cn } from '@/lib/utils'
import { Bar, GeoFilters, StatCard } from './shared'

export function CoverageView({ lockedState }: { lockedState?: string }) {
  const [data, setData] = useState<CoverageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState('')
  const [lga, setLga] = useState('')
  const s = lockedState ?? state

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setData(await getCoverage())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load coverage data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Initial load: keep every setState inside async callbacks.
    let cancelled = false
    getCoverage()
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load coverage data.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    // LGA filtering applies to the duty board; state rows are state-level aggregates.
    return data.rows
      .filter((r) => !s || r.state === s)
      .sort((a, b) => b.certified - a.certified || b.applications - a.applications)
  }, [data, s])

  const duty = useMemo(() => {
    if (!data) return []
    return data.duty.filter((d) => (!s || d.state === s) && (!lga || d.lga === lga))
  }, [data, s, lga])

  const totals = useMemo(() => {
    const t = rows.reduce(
      (acc, r) => ({
        applications: acc.applications + r.applications,
        certified: acc.certified + r.certified,
        pusAssigned: acc.pusAssigned + r.pusAssigned,
        checkedInToday: acc.checkedInToday + r.checkedInToday,
      }),
      { applications: 0, certified: 0, pusAssigned: 0, checkedInToday: 0 },
    )
    const register = rows.reduce((n, r) => n + (getState(r.state)?.pollingUnits ?? 0), 0)
    return { ...t, register }
  }, [rows])

  const maxCertified = Math.max(1, ...rows.map((r) => r.certified))
  const puEstimate = s ? (getState(s)?.pollingUnits ?? 0) : TOTALS.pollingUnits

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <GeoFilters state={state} lga={lga} onState={setState} onLga={setLga} lockedState={lockedState} />
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn(loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error} — coverage figures come from the live database; check DATABASE_URL.
        </div>
      )}

      <section aria-label="Coverage summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Applications" value={nf.format(totals.applications)} sub="in scope" tone="primary" />
        <StatCard
          label="Certified Guards"
          value={nf.format(totals.certified)}
          sub={`${nf.format(totals.applications)} applications overall`}
        />
        <StatCard
          label="Polling units covered"
          value={nf.format(totals.pusAssigned)}
          sub={
            data?.registerImported
              ? `register imported`
              : `of ~${nf.format(puEstimate)} (INEC estimate — register not imported)`
          }
        />
        <StatCard
          label="On duty today"
          value={nf.format(totals.checkedInToday)}
          sub="distinct Guards checked in (WAT)"
          tone={totals.checkedInToday > 0 ? 'primary' : 'default'}
        />
      </section>

      {!data?.registerImported && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Polling-unit register not imported.</strong> Coverage percentages use INEC&apos;s published per-state
          estimates. Run <code className="rounded bg-amber-100 px-1">pnpm db:import:pus</code> to load the official
          register and measure coverage against it.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="rounded-lg border bg-card xl:col-span-3">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-bold">
              <ScrollText className="size-4 text-primary" /> Coverage by state
            </h2>
            <span className="text-xs text-muted-foreground">{rows.length} states in scope</span>
          </div>
          <div className="max-h-[60vh] overflow-auto p-4">
            <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
              {rows.map((r) => {
                const register = r.pusTotal > 0 ? r.pusTotal : (getState(r.state)?.pollingUnits ?? 0)
                const pct = register ? Math.min(100, Math.round((r.pusAssigned / register) * 100)) : 0
                return (
                  <button
                    type="button"
                    key={r.state}
                    disabled={!!lockedState || !!s}
                    onClick={() => setState(r.state)}
                    className="grid grid-cols-[7.5rem_1fr_2.5rem_5.5rem] items-center gap-2 rounded text-left text-sm hover:bg-muted"
                  >
                    <span className="truncate">{r.state}</span>
                    <Bar value={r.certified} max={maxCertified} />
                    <span className="text-right tabular-nums">{nf.format(r.certified)}</span>
                    <span className="text-right text-xs tabular-nums text-muted-foreground">
                      {r.pusAssigned}/{nf.format(register)} PU
                    </span>
                    <span className="col-span-4 -mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{nf.format(r.applications)} applications</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="size-3 text-emerald-600" />
                        {r.checkedInToday} on duty today
                      </span>
                      <span>·</span>
                      <span>
                        {pct}% of {r.pusTotal > 0 ? 'register' : 'estimate'}
                      </span>
                    </span>
                  </button>
                )
              })}
              {rows.length === 0 && !loading && (
                <p className="col-span-2 py-8 text-center text-sm text-muted-foreground">
                  No applications in scope yet.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-card xl:col-span-2">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="font-bold">Duty board — latest check-ins</h2>
            <span className="text-xs text-muted-foreground">{duty.length} Guards</span>
          </div>
          <ul className="max-h-[60vh] divide-y overflow-auto">
            {duty.length === 0 && (
              <li className="p-6 text-center text-sm text-muted-foreground">
                No check-ins yet. Guards check in from “My polling unit” in the portal.
              </li>
            )}
            {duty.map((d) => (
              <li key={d.applicationId} className="flex items-start gap-3 p-3.5">
                <span
                  className={cn(
                    'mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                    isToday(d.at) ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isToday(d.at) ? <CheckCircle2 className="size-3.5" /> : <Clock className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.guardName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.pollingUnit} · {d.lga}, {d.state}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {isToday(d.at) ? (
                      <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200" variant="outline">
                        On duty today
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Last seen {timeAgo(d.at)}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{fmtDateTime(d.at)}</span>
                  </div>
                </div>
                {d.lat !== null && d.lng !== null && (
                  <a
                    className="shrink-0 self-center text-xs font-semibold text-primary hover:underline"
                    href={`https://www.google.com/maps?q=${d.lat.toFixed(5)},${d.lng.toFixed(5)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Map
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-bold">Guard positions & duty map</h2>
          <p className="text-xs text-muted-foreground">
            Latest check-in per Guard. Green = checked in today (Africa/Lagos).
          </p>
        </div>
        <NigeriaMap
          className="m-3 h-[24rem]"
          focus={s && getState(s) ? { lat: getState(s)!.lat, lng: getState(s)!.lng, zoom: 8 } : null}
          markers={duty
            .filter((d) => d.lat !== null && d.lng !== null)
            .map((d) => ({
              id: d.applicationId,
              lat: d.lat!,
              lng: d.lng!,
              color: isToday(d.at) ? '#059669' : '#a1a1aa',
              radius: 7,
              popup: `<b>${d.guardName}</b><br/>${d.pollingUnit}<br/>${fmtDateTime(d.at)}`,
            }))}
        />
        {duty.every((d) => d.lat === null || d.lng === null) && duty.length > 0 && (
          <p className="flex items-center gap-2 px-4 pb-4 text-xs text-muted-foreground">
            <XCircle className="size-3.5" /> No check-in included GPS coordinates, so there is nothing to plot yet.
          </p>
        )}
      </section>
    </div>
  )
}

function isToday(iso: string): boolean {
  // Compare in Africa/Lagos, matching the server-side duty counters.
  const lagos = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Africa/Lagos' }))
  const nowLagos = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }))
  return lagos.toDateString() === nowLagos.toDateString()
}
