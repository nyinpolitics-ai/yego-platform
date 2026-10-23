import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle2, Database, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/yego/fields'
import { getSetupStatusFn, runSetupFn, type SetupResult, type SetupStatus } from '@/server/functions'

export const Route = createFileRoute('/setup')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  head: () => ({ meta: [{ title: 'Platform setup · YEGO' }] }),
  loader: () => getSetupStatusFn(),
  component: SetupPage,
})

function StatusRow({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      )}
      <span>{children}</span>
    </li>
  )
}

function SetupPage() {
  const status: SetupStatus = Route.useLoaderData()
  const token = Route.useSearch().token

  // Without a token the page simply does not exist for the visitor — this
  // route must never advertise itself to strangers or bots.
  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/40 px-6 text-center">
        <ShieldCheck className="size-10 text-muted-foreground" />
        <p className="text-lg font-semibold">Page not found</p>
        <p className="text-sm text-muted-foreground">
          <a href="/" className="underline">
            Return to the home page
          </a>
        </p>
      </div>
    )
  }

  return <SetupWizard status={status} token={token} />
}

function SetupWizard({ status, token }: { status: SetupStatus; token: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [demo, setDemo] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SetupResult | null>(null)

  const dbProblem =
    !status.dbConfigured
      ? 'DATABASE_URL is not set on this server. Add it in your hosting dashboard (environment variables), redeploy, then reopen this page.'
      : !status.reachable
        ? 'The server could not reach the database. Double-check DATABASE_URL (use the pooled connection string on Neon), then reopen this page.'
        : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const res = await runSetupFn({ data: { token, email, name, password, confirm, demo } })
      setResult(res)
      toast.success('Platform initialised.')
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Setup failed.')
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Shell>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-8 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-black">Platform is ready</h1>
            <p className="text-sm text-muted-foreground">The database has been initialised successfully.</p>
          </div>
        </div>
        <ul className="mt-5 space-y-2 rounded-lg border bg-white p-4 text-sm">
          <li>
            <CheckCircle2 className="mr-2 inline size-4 text-emerald-600" />
            Migrations in place: <b>{status.migrationsTotal}</b> (schema, geography for all 36 states + FCT and 774 LGAs)
          </li>
          <li>
            <CheckCircle2 className="mr-2 inline size-4 text-emerald-600" />
            Super Administrator: <b>{result.adminEmail}</b>
          </li>
          {result.demo && (
            <li>
              <CheckCircle2 className="mr-2 inline size-4 text-emerald-600" />
              Sample data loaded: {result.demo.applications} applications, {result.demo.incidents} incidents,{' '}
              {result.demo.warnings} early warnings, {result.demo.accounts} demonstration accounts (password{' '}
              <code className="rounded bg-muted px-1">yego-preview</code>)
            </li>
          )}
        </ul>
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold">Before you share the link publicly</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Sign in at <a href="/login" className="font-medium underline">/login</a> with the administrator email and the
              password you just set, and confirm the Command views open.
            </li>
            <li>
              In your hosting dashboard, <b>delete the SETUP_TOKEN environment variable</b> and redeploy — the setup page
              then disables itself completely.
            </li>
            {demo && (
              <li>
                Before the official launch, load real data instead of the sample set (we will wipe the demonstration data
                together — just ask).
              </li>
            )}
          </ol>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="flex items-center gap-3">
        <Database className="size-8 text-ink" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">One-time platform setup</p>
          <h1 className="text-2xl font-black">Initialise the YEGO database</h1>
        </div>
      </div>

      {dbProblem ? (
        <div className="mt-5 rounded-lg border border-destructive/40 bg-red-50 p-4 text-sm text-destructive">{dbProblem}</div>
      ) : (
        <>
          <ul className="mt-5 space-y-2 rounded-lg border bg-white p-4">
            <StatusRow ok={status.tablesReady}>
              Database connection is working
              {status.tablesReady && ` · ${status.migrationsApplied} of ${status.migrationsTotal} migrations applied`}
            </StatusRow>
            <StatusRow ok={status.userCount > 0}>
              {status.userCount > 0
                ? `${status.userCount} user account(s) exist`
                : 'No user accounts yet — create the first Super Administrator below'}
            </StatusRow>
            <StatusRow ok={status.demoPresent}>
              {status.demoPresent
                ? 'Sample demonstration data is loaded'
                : 'No demonstration data yet (optional below — useful while showing the platform to stakeholders)'}
            </StatusRow>
          </ul>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Your full name (optional)" htmlFor="nm">
              <Input id="nm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ibrahim …" autoComplete="name" />
            </Field>
            <Field label="Administrator email" htmlFor="em">
              <Input
                id="em"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@yego.ng"
                autoComplete="email"
              />
            </Field>
            <Field label="New password (at least 12 characters)" htmlFor="pw">
              <Input
                id="pw"
                type="password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Repeat the password" htmlFor="pw2">
              <Input
                id="pw2"
                type="password"
                required
                minLength={12}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <label className="flex items-start gap-2 rounded-lg border bg-white p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={demo}
                onChange={(e) => setDemo(e.target.checked)}
              />
              <span>
                <b>Also load sample demonstration data</b> (recommended while showing the platform to stakeholders — we will
                clear it before the official launch). This resets existing users, so only tick it on a fresh database.
              </span>
            </label>
            {err && <p className="text-sm font-medium text-destructive">{err}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
              Initialise platform
            </Button>
            <p className="text-xs text-muted-foreground">
              This runs the database migrations, creates your administrator account and (optionally) the demonstration data.
              It can safely be run again if something was interrupted.
            </p>
          </form>
        </>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40 px-4 py-12">
      <div className="mx-auto w-full max-w-lg rounded-xl border bg-background p-6 shadow-sm sm:p-8">{children}</div>
    </div>
  )
}
