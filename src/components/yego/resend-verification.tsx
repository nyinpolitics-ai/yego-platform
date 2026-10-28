import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MailCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resendVerification } from '@/lib/demo-store'

/**
 * "Request a new verification email" form. Shown on the login screen when a
 * sign-in is blocked, in the Guard portal for unverified sessions, and on the
 * /verify-email page when a link is missing, expired or already used.
 * The mail is always sent to the address stored on the application record.
 */
export function ResendVerificationPanel({ appId }: { appId: string }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function resend(e: React.FormEvent) {
    e.preventDefault()
    setNote('')
    setBusy(true)
    try {
      const result = await resendVerification(appId, email)
      if (result.verified) {
        setNote('This email address is already verified — you can sign in now.')
      } else {
        setNote('Verification email sent. Check your inbox and your spam folder.')
        toast.success('Verification email sent')
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not send the email right now.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-secondary/50 p-4 text-left">
      <p className="flex items-center gap-2 text-sm font-bold">
        <MailCheck className="size-4 text-primary" /> Request a new verification email
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Enter the email address you used on the application. The verification link is only sent to that address.
      </p>
      <form onSubmit={resend} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          required
          placeholder="name@example.com"
          aria-label="Email address used on the application"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={busy || appId.trim().length < 4} className="shrink-0">
          Resend email
        </Button>
      </form>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        Not sure of your Application ID? Check the confirmation email we sent, or{' '}
        <Link to="/status" className="font-semibold text-primary underline">
          track your application status
        </Link>
        .
      </p>
    </div>
  )
}
