import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Loader2, MessageCircle, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/yego/fields'
import { AppStatusBadge } from '@/components/yego/status'
import { PublicShell } from '@/components/yego/site-shell'
import { ApplicationTracker } from '@/components/yego/tracker'
import { WHATSAPP_CHANNEL_CONFIGURED, WHATSAPP_CHANNEL_URL } from '@/lib/config'
import { confirmWhatsApp, lookupApplication } from '@/lib/demo-store'
import type { Application } from '@/lib/fixtures'
import { fmtDate } from '@/lib/format'

export const Route = createFileRoute('/status')({
  validateSearch: (s: Record<string, unknown>): { id?: string } => ({
    id: typeof s.id === 'string' ? s.id : undefined,
  }),
  head: () => ({ meta: [{ title: 'Check application status · YEGO' }] }),
  component: StatusPage,
})

function StatusPage() {
  const { id } = Route.useSearch()
  const [q, setQ] = useState(id ?? '')
  const [phone, setPhone] = useState('')
  const [app, setApp] = useState<Application | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function check(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setApp(null)
    if (!q.trim() || !phone.trim()) {
      setError('Enter both the Application ID and the phone number used to apply.')
      return
    }
    setBusy(true)
    try {
      const result = await lookupApplication(q.trim(), phone.trim())
      setApp(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check that application.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 md:py-14">
        <h1 className="text-3xl font-black sm:text-4xl">Check application status</h1>
        <p className="mt-2 text-muted-foreground">
          Enter the Application ID you received after applying, and the phone number you used. Both are required to protect
          applicant information.
        </p>

        <form className="mt-6 space-y-4" onSubmit={check}>
          <Field label="Application ID" htmlFor="app-id">
            <Input
              id="app-id"
              value={q}
              onChange={(e) => setQ(e.target.value.toUpperCase())}
              placeholder="YG-APP-000000"
              className="h-11 font-mono uppercase"
            />
          </Field>
          <Field label="Phone number used to apply" htmlFor="app-phone">
            <Input
              id="app-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0803 123 4567"
              className="h-11"
            />
          </Field>
          <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Search />} Check status
          </Button>
        </form>

        {error && (
          <div role="alert" className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm">
            {error}
          </div>
        )}

        {app && (
          <div className="mt-8 rounded-lg border bg-card">
            <div className="flex flex-wrap items-center gap-4 border-b p-5">
              {app.photo ? (
                <img src={app.photo} alt="" className="size-14 rounded-full object-cover" />
              ) : (
                <span className="grid size-14 place-items-center rounded-full bg-secondary font-display text-lg font-black text-secondary-foreground">
                  {app.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                </span>
              )}
              <div className="flex-1">
                <p className="font-bold">{app.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {app.id} · {app.lga}, {app.stateOfResidence} · Applied {fmtDate(app.submittedAt)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {app.emailVerified
                    ? 'Email address verified.'
                    : 'Email verification pending: open the verification link we emailed you.'}
                </p>
              </div>
              <AppStatusBadge status={app.status} />
            </div>
            {!app.confirmedWhatsApp && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-accent/20 p-4 text-sm">
                <span>Your application is not yet confirmed on the WhatsApp Channel.</span>
                {WHATSAPP_CHANNEL_CONFIGURED ? (
                  <Button
                    asChild
                    size="sm"
                    className="bg-[#25D366] text-[#073b1c] hover:bg-[#25D366]/90"
                    onClick={() => {
                      void confirmWhatsApp(app.id, phone)
                        .then(() => toast.success('Application confirmed'))
                        .catch((err: unknown) =>
                          toast.error(err instanceof Error ? err.message : 'Could not confirm the application.'),
                        )
                    }}
                  >
                    <a href={WHATSAPP_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
                      <MessageCircle /> Confirm now
                    </a>
                  </Button>
                ) : (
                  <a
                    className="font-semibold text-primary underline"
                    href="https://wa.me/2348157031718"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Contact the YEGO desk
                  </a>
                )}
              </div>
            )}
            <div className="p-5 sm:p-6">
              <ApplicationTracker app={app} />
            </div>
            <div className="border-t p-5 text-sm text-muted-foreground">
              Already approved?{' '}
              <Link to="/login" className="font-semibold text-primary hover:underline">
                Log in to the Guard portal
              </Link>{' '}
              with your Application ID and phone number.
            </div>
          </div>
        )}
      </div>
    </PublicShell>
  )
}
