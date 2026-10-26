import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
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
      { title: 'Apply as a YEGO Volunteer' },
      { property: 'og:title', content: 'Apply as a YEGO Volunteer · YEGO' },
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
      const app = await submitApplication({
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
      setDone(app)
      setPhoneForConfirmation(phone)
      window.scrollTo({ top: 0 })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit the application.')
    } finally {
      setBusy(false)
    }
  }

  if (done) return <Success app={done} phone={phoneForConfirmation} />

  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-14">
        <p className="text-sm font-bold uppercase tracking-wider text-primary">YEGO Volunteer application</p>
        <h1 className="mt-1 text-3xl font-black sm:text-4xl">Apply as a YEGO Volunteer</h1>
        <p className="mt-2 text-muted-foreground">
          Apply → Profile → Screening → Verification → Training → Certification → Deployment
        </p>

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
              <Field label="National Identification Number (NIN)" htmlFor="nin" error={errors.nin} hint="11 digits. Used only for identity verification and stored encrypted.">
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

function Success({ app, phone }: { app: Application; phone: string }) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <div className="rounded-lg border bg-card p-6 text-center sm:p-10">
          <CheckCircle2 className="mx-auto size-14 text-primary" />
          <h1 className="mt-4 text-3xl font-black">Application received</h1>
          <p className="mt-2 text-muted-foreground">
            Thank you, {app.fullName.split(' ')[0]}. Keep your Application ID safe; you need it to track your progress.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent/25 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-foreground">
            <MessageCircle className="size-3.5" /> Next step: join the YEGO community
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
              <MailCheck className="size-4 text-primary" /> Verify your email address
            </p>
            <p className="mt-1 text-muted-foreground">
              A verification link was sent automatically to{' '}
              <span className="font-semibold text-foreground">{app.email}</span>. Open it to confirm your email address; the
              link expires in 72 hours. Check your spam folder if you do not see it.
            </p>
          </div>

          <div className="mt-8 rounded-lg border-2 border-[#25D366]/40 bg-[#e7f8ee] p-5 text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-[#0b6b3a]">Step 1 of 2 · Join the community</p>
            <p className="mt-2 text-lg font-black">Your application is complete only after you join.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Join the official YEGO WhatsApp community for confirmation, screening dates, training access and deployment
              instructions. This is the only channel YEGO uses for applicant updates.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-4 w-full bg-[#25D366] text-[#073b1c] hover:bg-[#25D366]/90"
              onClick={() => {
                void confirmWhatsApp(app.id, phone)
                  .then(() => setConfirmed(true))
                  .catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : 'Could not confirm the application.'),
                  )
              }}
            >
              <a href={WHATSAPP_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> {confirmed ? 'Confirmed · open the community again' : 'Join the YEGO community now'}
              </a>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Step 2: keep your Application ID and track screening progress at any time.
            </p>
          </div>

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
