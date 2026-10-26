import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle2, Loader2, MailCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PublicShell } from '@/components/yego/site-shell'
import { verifyEmailFn } from '@/server/functions'

export const Route = createFileRoute('/verify-email')({
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({
    token: typeof s.token === 'string' ? s.token : undefined,
  }),
  head: () => ({ meta: [{ title: 'Verify your email · YEGO' }] }),
  component: VerifyEmailPage,
})

interface VerifyResult {
  ok: boolean
  applicationId: string
  fullName: string
  alreadyVerified: boolean
}

function VerifyEmailPage() {
  const { token } = Route.useSearch()
  const [state, setState] = useState<'verifying' | 'done' | 'error'>('verifying')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [message, setMessage] = useState('')
  const attempted = useRef('')

  useEffect(() => {
    // Run once per token: the effect may re-fire in development strict mode.
    if (!token || attempted.current === token) return
    attempted.current = token
    verifyEmailFn({ data: { token } })
      .then((res) => {
        setResult(res as VerifyResult)
        setState('done')
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'This verification link is not valid.')
        setState('error')
      })
  }, [token])

  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <div className="rounded-lg border bg-card p-6 text-center sm:p-10">
          {state === 'verifying' && (
            <>
              <Loader2 className="mx-auto size-12 animate-spin text-primary motion-reduce:animate-none" />
              <h1 className="mt-4 text-2xl font-black">Verifying your email address</h1>
              <p className="mt-2 text-muted-foreground">Please wait while we confirm your verification link.</p>
            </>
          )}

          {state === 'done' && result && (
            <>
              <CheckCircle2 className="mx-auto size-14 text-primary" />
              <h1 className="mt-4 text-3xl font-black">Email address verified</h1>
              <p className="mt-2 text-muted-foreground">
                Thank you, {result.fullName.split(' ')[0]}. Your email address is confirmed for application{' '}
                <span className="font-mono font-bold text-foreground">{result.applicationId}</span>.
                {result.alreadyVerified ? ' It was already verified before.' : ''}
              </p>
              <div className="mt-6 rounded-lg border bg-secondary p-5 text-left">
                <p className="flex items-center gap-2 font-bold">
                  <MailCheck className="size-4 text-primary" /> What happens next
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary-foreground">
                  <li>Your State desk reviews the application and screens your details.</li>
                  <li>Confirm you are on the official YEGO WhatsApp community for screening dates.</li>
                  <li>Track your progress at any time with your Application ID and phone number.</li>
                </ul>
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button asChild>
                  <Link to="/status" search={{ id: result.applicationId }}>
                    Track application status
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">Back to home</Link>
                </Button>
              </div>
            </>
          )}

          {state === 'error' && (
            <>
              <AlertTriangle className="mx-auto size-14 text-destructive" />
              <h1 className="mt-4 text-3xl font-black">We could not verify that link</h1>
              <p className="mt-2 text-muted-foreground">{message}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button asChild variant="outline">
                  <Link to="/status">Check application status</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/">Back to home</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </PublicShell>
  )
}
