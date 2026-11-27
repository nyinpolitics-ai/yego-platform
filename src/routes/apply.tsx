import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  MailCheck,
  MessageCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, NativeSelect } from '@/components/yego/fields'
import { PhotoCapture } from '@/components/yego/photo-capture'
import { PublicShell } from '@/components/yego/site-shell'
import { MIN_AGE, OG_IMAGE, WHATSAPP_CHANNEL_URL } from '@/lib/config'
import { confirmWhatsApp, listPollingUnits, submitApplication } from '@/lib/demo-store'
import { PROFESSIONAL_BACKGROUNDS, type Application } from '@/lib/fixtures'
import { STATES, getState } from '@/lib/nigeria'
import { useWards } from '@/lib/wards'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/apply')({
  head: () => ({
    meta: [
      { title: 'Apply as YEGO Volunteer' },
      { property: 'og:title', content: 'Apply as YEGO Volunteer · YEGO' },
      {
        property: 'og:description',
        content:
          'Submit your application to serve as a non-partisan YEGO volunteer observer. Open to Nigerians aged 18 and above.',
      },
      { property: 'og:image', content: OG_IMAGE },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:image', content: OG_IMAGE },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: ApplyPage,
})

const STEPS = ['Personal details', 'Location', 'Background', 'Photo & declaration'] as const
const PU_DEFAULT = 'To be assigned by my coordinator'
const STATE_NAMES = STATES.map((s) => s.name)

const EMPTY = {
  fullName: '',
  gender: '' as '' | 'Female' | 'Male',
  dateOfBirth: '',
  phone: '',
  whatsapp: '',
  sameWhatsapp: true,
  nin: '',
  email: '',
  stateOfOrigin: '',
  stateOfResidence: '',
  lga: '',
  ward: '',
  pollingUnit: PU_DEFAULT,
  background: '',
  experience: '',
  photo: undefined as string | undefined,
  nonPartisan: false,
  codeOfConduct: false,
  dataConsent: false,
}
type FormState = typeof EMPTY
type Errors = Partial<Record<keyof FormState, string>>

const PHONE = /^(\+?234|0)[789][01]\d{8}$/

function age(dob: string) {
  const b = new Date(dob)
  const n = new Date()
  let a = n.getFullYear() - b.getFullYear()
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--
  return a
}

function validate(step: number, f: FormState): Errors {
  const e: Errors = {}
  if (step === 0) {
    if (f.fullName.trim().split(/\s+/).length < 2) e.fullName = 'Enter your first and last name as on your NIN.'
    if (!f.gender) e.gender = 'Select gender.'
    if (!f.dateOfBirth) e.dateOfBirth = 'Enter your date of birth.'
    else if (age(f.dateOfBirth) < MIN_AGE)
      e.dateOfBirth = `YEGO volunteers must be at least ${MIN_AGE} years old.`
    if (!PHONE.test(f.phone.replace(/\s/g, ''))) e.phone = 'Enter a valid Nigerian mobile number, e.g. 0803 123 4567.'
    if (!f.sameWhatsapp && !PHONE.test(f.whatsapp.replace(/\s/g, ''))) e.whatsapp = 'Enter a valid WhatsApp number.'
    if (!/^\d{11}$/.test(f.nin)) e.nin = 'NIN must be exactly 11 digits.'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address.'
  }
  if (step === 1) {
    if (!f.stateOfOrigin) e.stateOfOrigin = 'Select your state of origin.'
    if (!f.stateOfResidence) e.stateOfResidence = 'Select where you live now.'
    if (!f.lga) e.lga = 'Select your LGA.'
    if (f.ward.trim().length < 2) e.ward = 'Select your ward / registration area.'
  }
  if (step === 2) {
    if (!f.background) e.background = 'Select your background.'
  }
  if (step === 3) {
    if (!f.photo) e.photo = 'A passport photograph is required.'
    if (!f.nonPartisan) e.nonPartisan = 'Required.'
    if (!f.codeOfConduct) e.codeOfConduct = 'Required.'
    if (!f.dataConsent) e.dataConsent = 'Required.'
  }
  return e
}

function ApplyPage() {
  const [step, setStep] = useState(0)
  const [f, setF] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Application | null>(null)
  const [phoneForConfirmation, setPhoneForConfirmation] = useState('')
  const [emailConfigured, setEmailConfigured] = useState(true)
  const wards = useWards()
  const [pollingUnits, setPollingUnits] = useState<{ code: string; name: string; ward: string }[]>([])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    setErrors((p) => ({ ...p, [k]: undefined }))
  }
  const lgas = getState(f.stateOfResidence)?.lgas ?? []
  const wardOptions = wards?.[f.stateOfResidence]?.[f.lga] ?? []

  useEffect(() => {
    if (!f.stateOfResidence || !f.lga || !f.ward) return
    let active = true
    listPollingUnits(f.stateOfResidence, f.lga, f.ward)
      .then((rows) => {
        if (active) setPollingUnits(rows)
      })
      .catch(() => {
        if (active) setPollingUnits([])
      })
    return () => {
      active = false
    }
  }, [f.stateOfResidence, f.lga, f.ward])

  const pollingUnitOptions = [
    PU_DEFAULT,
    ...pollingUnits.map((unit) => {
      const differentWard = unit.ward && unit.ward.toLowerCase() !== f.ward.toLowerCase()
      return `${unit.code} · ${unit.name}${differentWard ? ` (${unit.ward})` : ''}`
    }),
  ]

  async function next() {
    const e = validate(step, f)
    setErrors(e)
    if (Object.keys(e).length) {
      toast.error('Please fix the highlighted fields.')
      return
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setBusy(true)
    try {
      const phone = f.phone.replace(/\s/g, '')
      const { application, emailConfigured: configured } = await submitApplication({
        fullName: f.fullName.trim(),
        gender: f.gender as 'Female' | 'Male',
        dateOfBirth: f.dateOfBirth,
        phone,
        whatsapp: (f.sameWhatsapp ? f.phone : f.whatsapp).replace(/\s/g, ''),
        nin: f.nin,
        email: f.email.trim(),
        stateOfOrigin: f.stateOfOrigin,
        stateOfResidence: f.stateOfResidence,
        lga: f.lga,
        ward: f.ward.trim(),
        pollingUnit: f.pollingUnit && f.pollingUnit !== PU_DEFAULT ? f.pollingUnit : undefined,
        background: f.background,
        experience: f.experience.trim(),
        photo: f.photo!,
        nonPartisan: true,
        codeOfConduct: true,
        dataConsent: true,
      })
      setDone(application)
      setPhoneForConfirmation(phone)
      setEmailConfigured(configured)
      window.scrollTo({ top: 0 })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit the application.')
    } finally {
      setBusy(false)
    }
  }

  if (done) return <Success app={done} phone={phoneForConfirmation} emailConfigured={emailConfigured} />

  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-14">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">YEGO Volunteer application</p>
        <h1 className="mt-1 text-3xl font-black sm:text-4xl">Apply as YEGO Volunteer</h1>
        <p className="mt-2 text-muted-foreground">
          Apply → Profile → Screening → Verification → Training → Certification → Deployment
        </p>

        {/* Why join YEGO (owners' copy) */}
        <section className="mt-8 rounded-xl border bg-secondary/40 p-5 sm:p-6" aria-label="Why join YEGO">
          <h2 className="text-lg font-black uppercase tracking-wide">Why join YEGO?</h2>
          <p className="mt-1 text-sm text-muted-foreground">As a YEGO Volunteer, you will have the opportunity to:</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              {
                title: 'Access to YEGO+ Economic Community',
                body: 'Develop your entrepreneurship skills, and grow your venture.',
              },
              {
                title: 'Training & Certification',
                body: 'Become a certified Democratic Accountability Ambassador after completing the required training.',
              },
              {
                title: 'Election Day Support',
                body: 'Eligible and deployed volunteers will receive stipends and operational support for Election Day activities.',
              },
              {
                title: 'Networking & Opportunities',
                body: 'Connect with young leaders, civil society organisations, and relevant development opportunities.',
              },
            ].map((b) => (
              <li key={b.title} className="flex gap-2.5 rounded-lg bg-card p-4">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="text-sm">
                  <span className="font-bold">{b.title}:</span> {b.body}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-primary p-4 text-primary-foreground">
            <p className="text-sm font-black uppercase tracking-wide">Join YEGO today!</p>
            <p className="mt-1 text-sm text-primary-foreground/90">
              Be part of Nigeria’s largest youth-led election observation movement to prevent electoral violence,
              promote peaceful elections, and protect democracy.
            </p>
          </div>
        </section>

        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Application steps">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined}>
              <div className={cn('h-1.5 rounded-full', i <= step ? 'bg-primary' : 'bg-muted')} />
              <p className={cn('mt-2 hidden text-xs font-semibold sm:block', i === step ? 'text-foreground' : 'text-muted-foreground')}>
                {i + 1}. {s}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm font-semibold sm:hidden">
          Step {step + 1} of 4: {STEPS[step]}
        </p>

        <div className="mt-6 rounded-lg border bg-card p-5 sm:p-8">
          {step === 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name (as on NIN)" htmlFor="fullName" error={errors.fullName} className="sm:col-span-2">
                <Input id="fullName" autoComplete="name" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} aria-invalid={!!errors.fullName} />
              </Field>
              <Field label="Gender" htmlFor="gender" error={errors.gender}>
                <NativeSelect id="gender" placeholder="Select" options={['Female', 'Male']} value={f.gender} onChange={(e) => set('gender', e.target.value as FormState['gender'])} aria-invalid={!!errors.gender} />
              </Field>
              <Field
                label="Date of birth"
                htmlFor="dob"
                error={errors.dateOfBirth}
                hint={f.dateOfBirth ? `Age: ${age(f.dateOfBirth)}` : `Ages ${MIN_AGE} and above`}
              >
                <Input id="dob" type="date" value={f.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} aria-invalid={!!errors.dateOfBirth} />
              </Field>
              <Field label="Phone number" htmlFor="phone" error={errors.phone}>
                <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={f.phone} onChange={(e) => set('phone', e.target.value)} aria-invalid={!!errors.phone} />
              </Field>
              <Field label="WhatsApp number" htmlFor="whatsapp" error={errors.whatsapp}>
                <Input id="whatsapp" type="tel" inputMode="tel" disabled={f.sameWhatsapp} placeholder={f.sameWhatsapp ? 'Same as phone' : '0803 123 4567'} value={f.sameWhatsapp ? '' : f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} aria-invalid={!!errors.whatsapp} />
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={f.sameWhatsapp} onCheckedChange={(v) => set('sameWhatsapp', v === true)} /> Same as phone number
                </label>
              </Field>
              <Field label="National Identification Number (NIN)" htmlFor="nin" error={errors.nin} hint="11 digits. Used only to verify the identity of applicant.">
                <Input id="nin" inputMode="numeric" maxLength={11} value={f.nin} onChange={(e) => set('nin', e.target.value.replace(/\D/g, ''))} aria-invalid={!!errors.nin} />
              </Field>
              <Field label="Email address" htmlFor="email" error={errors.email}>
                <Input id="email" type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errors.email} />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="State of origin" htmlFor="soo" error={errors.stateOfOrigin}>
                <NativeSelect id="soo" placeholder="Select state" options={STATE_NAMES} value={f.stateOfOrigin} onChange={(e) => set('stateOfOrigin', e.target.value)} aria-invalid={!!errors.stateOfOrigin} />
              </Field>
              <Field label="State of residence" htmlFor="sor" error={errors.stateOfResidence} hint="You will be deployed where you live.">
                <NativeSelect
                  id="sor"
                  placeholder="Select state"
                  options={STATE_NAMES}
                  value={f.stateOfResidence}
                  onChange={(e) => {
                    set('stateOfResidence', e.target.value)
                    set('lga', '')
                    set('ward', '')
                    set('pollingUnit', PU_DEFAULT)
                    setPollingUnits([])
                  }}
                  aria-invalid={!!errors.stateOfResidence}
                />
              </Field>
              <Field label="Local Government Area" htmlFor="lga" error={errors.lga}>
                <NativeSelect
                  id="lga"
                  placeholder={f.stateOfResidence ? `Select LGA (${lgas.length})` : 'Select state first'}
                  disabled={!f.stateOfResidence}
                  options={lgas}
                  value={f.lga}
                  onChange={(e) => {
                    set('lga', e.target.value)
                    set('ward', '')
                    set('pollingUnit', PU_DEFAULT)
                    setPollingUnits([])
                  }}
                  aria-invalid={!!errors.lga}
                />
              </Field>
              <Field
                label="Ward / registration area"
                htmlFor="ward"
                error={errors.ward}
                hint={wards ? `${wardOptions.length} wards available in ${f.lga || 'this LGA'}` : 'Loading wards…'}
              >
                <NativeSelect
                  id="ward"
                  placeholder={!f.lga ? 'Select LGA first' : wards ? 'Select ward' : 'Loading wards…'}
                  disabled={!f.lga || !wards}
                  options={wardOptions}
                  value={f.ward}
                  onChange={(e) => {
                    set('ward', e.target.value)
                    set('pollingUnit', PU_DEFAULT)
                    setPollingUnits([])
                  }}
                  aria-invalid={!!errors.ward}
                />
              </Field>
              <Field
                label="Preferred polling unit (optional)"
                htmlFor="pu"
                hint={
                  pollingUnits.length
                    ? 'Official polling units for the selected ward or LGA.'
                    : 'No official polling unit is imported for this ward yet. Your coordinator will assign one; you can still submit.'
                }
                className="sm:col-span-2"
              >
                <NativeSelect
                  id="pu"
                  options={pollingUnitOptions}
                  value={f.pollingUnit || PU_DEFAULT}
                  onChange={(e) => set('pollingUnit', e.target.value)}
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-5">
              <Field label="Educational / professional background" htmlFor="bg" error={errors.background}>
                <NativeSelect id="bg" placeholder="Select" options={PROFESSIONAL_BACKGROUNDS} value={f.background} onChange={(e) => set('background', e.target.value)} aria-invalid={!!errors.background} />
              </Field>
              <Field label="Relevant civic / electoral experience" htmlFor="exp" hint="Previous observation, ad-hoc INEC duty, voter education, community work, etc. Leave blank if none.">
                <Textarea id="exp" rows={5} value={f.experience} onChange={(e) => set('experience', e.target.value)} />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <Field label="Passport photograph" error={errors.photo}>
                <PhotoCapture value={f.photo} onChange={(v) => set('photo', v)} />
              </Field>
              <div className="space-y-3">
                {(
                  [
                    ['nonPartisan', 'Declaration of non-partisanship & impartiality', 'I am not a member, agent or candidate of any political party, and I will observe impartially without wearing or promoting party symbols.'],
                    ['codeOfConduct', 'YEGO Code of Conduct', 'I will act peacefully, report truthfully, never interfere with voting or officials, and follow instructions from my coordinators.'],
                    ['dataConsent', 'Data-use consent', 'I consent to YEGO processing my personal data, including NIN and photograph, for screening, verification and deployment, in line with the Nigeria Data Protection Act 2023.'],
                  ] as const
                ).map(([k, title, body]) => (
                  <label
                    key={k}
                    className={cn(
                      'flex gap-3 rounded-lg border p-4',
                      errors[k] ? 'border-destructive bg-destructive/5' : f[k] ? 'border-primary bg-secondary' : '',
                    )}
                  >
                    <Checkbox className="mt-0.5" checked={f[k]} onCheckedChange={(v) => set(k, v === true)} />
                    <span>
                      <span className="block text-sm font-bold">{title}</span>
                      <span className="block text-sm text-muted-foreground">{body}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t pt-6">
            <Button type="button" variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Back
            </Button>
            <Button type="button" onClick={next} disabled={busy} size="lg">
              {busy ? (
                <>
                  <Loader2 className="animate-spin motion-reduce:animate-none" /> Submitting
                </>
              ) : step === STEPS.length - 1 ? (
                <>
                  Submit application <Check />
                </>
              ) : (
                <>
                  Continue <ArrowRight />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </PublicShell>
  )
}

function Success({ app, phone, emailConfigured }: { app: Application; phone: string; emailConfigured: boolean }) {
  // "confirming" / "confirmed" track this page session only; the durable flag is
  // whatsapp_confirmed_at in the database (shown on /status and in the admin
  // applicant profile). Confirming is explicitly triggered by the applicant —
  // opening the WhatsApp link alone never records a confirmation.
  const [confirmed, setConfirmed] = useState(app.confirmedWhatsApp)
  const [confirming, setConfirming] = useState(false)

  function confirmJoined() {
    if (confirming || confirmed) return
    setConfirming(true)
    confirmWhatsApp(app.id, phone)
      .then(() => {
        setConfirmed(true)
        toast.success('WhatsApp membership confirmed. Thank you!')
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not confirm the application.'),
      )
      .finally(() => setConfirming(false))
  }

  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <div className="rounded-lg border bg-card p-6 text-center sm:p-10">
          <CheckCircle2 className="mx-auto size-14 text-primary" />
          <h1 className="mt-4 text-3xl font-black">Application received</h1>
          <p className="mt-2 text-muted-foreground">
            Thank you, {app.fullName.split(' ')[0]}. Your application was submitted successfully. Keep your Application ID
            safe; you need it to track your progress.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent/25 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-foreground">
            <MessageCircle className="size-3.5" /> Next step: join the YEGO WhatsApp channel
          </p>
          <div className="mx-auto mt-6 flex max-w-sm items-center justify-between gap-2 rounded-lg border-2 border-dashed border-primary bg-secondary px-4 py-3">
            <span className="font-mono text-xl font-bold tracking-wider">{app.id}</span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Copy Application ID"
              onClick={() => {
                void navigator.clipboard?.writeText(app.id)
                toast.success('Application ID copied')
              }}
            >
              <Copy />
            </Button>
          </div>

          <div className="mt-6 rounded-lg border bg-background p-4 text-left text-sm">
            <p className="flex items-center gap-2 font-bold">
              <KeyRound className="size-4 text-primary" /> Your YEGO login details
            </p>
            <dl className="mt-2 space-y-1 text-muted-foreground">
              <div className="flex flex-wrap justify-between gap-x-3">
                <dt>Username</dt>
                <dd className="font-mono font-bold text-foreground">{app.id}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3">
                <dt>Initial password</dt>
                <dd className="font-mono font-bold text-foreground">{phone}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Use these to sign in at the login page. For security, you will choose your own password the first time you
              sign in. We have also sent these details to <span className="font-semibold text-foreground">{app.email}</span>.
            </p>
          </div>

          {/* STEP 1 — mandatory WhatsApp channel step, shown BEFORE email verification. */}
          <div className="mt-8 rounded-lg border-2 border-[#25D366]/60 bg-[#e7f8ee] p-5 text-left shadow-sm">
            <p className="text-xs font-black uppercase tracking-wider text-[#0b6b3a]">
              Step 1 of 2 — Required action: join the official YEGO WhatsApp channel
            </p>
            <p className="mt-2 text-base font-black leading-snug text-[#073b1c]">
              YOUR APPLICATION HAS BEEN RECEIVED, BUT IT IS NOT COMPLETE UNTIL YOU JOIN THE OFFICIAL YEGO WHATSAPP
              CHANNEL AND CONFIRM YOUR MEMBERSHIP.
            </p>
            <p className="mt-2 text-sm text-[#24452f]">
              All important applicant confirmation, screening announcements, training updates and deployment
              instructions are shared through the official YEGO channel.
            </p>
            <p className="mt-2 text-sm font-bold text-[#0b6b3a]">
              Do not skip this step. Join the channel now so you do not miss important information about your
              application.
            </p>
            <Button asChild size="lg" className="mt-4 w-full bg-[#25D366] text-[#073b1c] hover:bg-[#25D366]/90">
              <a href={WHATSAPP_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> Join the official YEGO WhatsApp channel
              </a>
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Opens the official channel in a new tab. After you have joined, confirm below.
            </p>
            {confirmed ? (
              <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-[#25D366]/60 bg-white/70 p-3 sm:flex-row sm:justify-center">
                <p className="flex items-center gap-1.5 text-sm font-bold text-[#0b6b3a]">
                  <CheckCircle2 className="size-4" /> WhatsApp membership confirmed
                </p>
                <Button asChild size="sm" variant="outline">
                  <a href={WHATSAPP_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
                    <MessageCircle /> Reopen the official channel
                  </a>
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="mt-3 w-full border-[#0b6b3a] text-[#0b6b3a] hover:bg-[#0b6b3a] hover:text-white"
                disabled={confirming}
                onClick={confirmJoined}
              >
                {confirming ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <CheckCircle2 />}
                I have joined — confirm
              </Button>
            )}
          </div>

          <div className="mt-4 rounded-lg border bg-background p-4 text-left text-sm">
            <p className="flex items-center gap-2 font-bold">
              <MailCheck className="size-4 text-primary" /> Verify your email address
            </p>
            {emailConfigured ? (
              <p className="mt-1 text-muted-foreground">
                A confirmation email with a <span className="font-semibold text-foreground">Verify My Email Address</span>{' '}
                button was sent automatically to{' '}
                <span className="font-semibold text-foreground">{app.email}</span>. Open it to confirm your email address;
                the link expires in 72 hours. Check your spam folder if you do not see it — you can request a fresh link at
                any time on the verify-email page.
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                <span className="font-semibold text-foreground">We could not send your confirmation email just now</span>{' '}
                (the email service is temporarily unavailable). Your application is safely recorded. Please try the resend
                option on the verify-email page in a little while, or contact the YEGO desk if it keeps failing.
              </p>
            )}
          </div>

          <p className="mt-4 rounded-lg bg-muted p-3 text-left text-xs leading-relaxed text-muted-foreground">
            <span className="font-bold text-foreground">What each status means:</span> your{' '}
            <span className="font-semibold text-foreground">application data is received and saved</span> as soon as you
            submit; <span className="font-semibold text-foreground">WhatsApp membership</span> is confirmed only when you
            press “I have joined — confirm” after joining the official channel; your{' '}
            <span className="font-semibold text-foreground">email address</span> is verified only through the
            verification link we emailed you. Each step is recorded separately in your file.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild variant="outline">
              <Link to="/status" search={{ id: app.id }}>
                Step 2: track application status
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </div>
    </PublicShell>
  )
}
