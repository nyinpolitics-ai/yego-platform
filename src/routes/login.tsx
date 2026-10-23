import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { KeyRound, Lock, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field } from '@/components/yego/fields'
import { YegoLogo } from '@/components/yego/logo'
import { signIn, signInApplicant } from '@/lib/demo-store'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: 'Login · YEGO Platform' }] }),
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [appId, setAppId] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function guardLogin(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const s = await signInApplicant(appId, phone)
      toast.success(`Welcome, ${s.name.split(' ')[0]}`)
      void navigate({ to: '/portal' })
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  async function staffLogin(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const s = await signIn(email, password)
      toast.success(`Signed in as ${s.role}`)
      void navigate({ to: s.kind === 'command' ? '/command' : '/portal' })
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-white lg:flex">
        <img
          src="/img/man-o-war-partnership.jpg"
          alt="YEGO leadership in an official session with Man O’ War Nigeria"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-transparent to-ink/70" />
        <a href="/" className="relative">
          <YegoLogo inverted />
        </a>
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Official access</p>
          <h2 className="mt-2 text-4xl font-black leading-tight">Secure access for Guards and Command.</h2>
          <p className="mt-3 max-w-md text-white/70">
            Role-based access means every user only sees the information their responsibility requires, from National Command to
            a single polling unit.
          </p>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-white/60">
          <Lock className="size-3.5" /> All sessions are logged for audit.
        </p>
      </div>

      <div className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <a href="/" className="lg:hidden">
            <YegoLogo />
          </a>
          <h1 className="mt-8 text-3xl font-black lg:mt-0">Log in</h1>
          <p className="mt-1 text-muted-foreground">Choose how you’re signing in.</p>

          <Tabs defaultValue="guard" className="mt-6" onValueChange={() => setErr('')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="guard">
                <UserRound /> Guard / Applicant
              </TabsTrigger>
              <TabsTrigger value="staff">
                <ShieldCheck /> Command staff
              </TabsTrigger>
            </TabsList>

            <TabsContent value="guard">
              <form onSubmit={guardLogin} className="mt-4 space-y-4">
                <Field label="Application ID" htmlFor="appid">
                  <Input id="appid" className="font-mono uppercase" placeholder="YG-APP-000000" value={appId} onChange={(e) => setAppId(e.target.value)} />
                </Field>
                <Field label="Phone number used to apply" htmlFor="ph">
                  <Input id="ph" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                {err && <p className="text-sm font-medium text-destructive">{err}</p>}
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  <KeyRound /> Log in to Guard portal
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="staff">
              <form onSubmit={staffLogin} className="mt-4 space-y-4">
                <Field label="Official email" htmlFor="em">
                  <Input id="em" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Password" htmlFor="pw">
                  <Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                {err && <p className="text-sm font-medium text-destructive">{err}</p>}
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  <ShieldCheck /> Log in to Command
                </Button>
              </form>
            </TabsContent>
          </Tabs>

        </div>
      </div>
    </div>
  )
}
