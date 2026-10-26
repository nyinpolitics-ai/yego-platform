import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  FileSearch,
  MapPin,
  Radio,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PublicShell } from '@/components/yego/site-shell'

export const Route = createFileRoute('/erart')({
  head: () => ({ meta: [{ title: 'Early Warning & Rapid Response · YEGO' }] }),
  component: ErartPage,
})

const STEPS = [
  { icon: MapPin, title: 'Submit', body: 'A Guard or coordinator files a geotagged report from the field.' },
  { icon: FileSearch, title: 'Document', body: 'Type, severity, time and evidence are recorded against a reference.' },
  { icon: Users, title: 'Share', body: 'The report reaches the right Command desk within its geographic scope.' },
  { icon: ShieldCheck, title: 'Verify', body: 'A verification officer reviews the evidence and may request clarification.' },
  { icon: Send, title: 'Process', body: 'The verified incident is categorised and prepared for referral.' },
  { icon: CheckCircle2, title: 'Respond', body: 'The responsible authority receives the referral; the outcome is tracked.' },
]

const CAPABILITIES = [
  'Structured incident intake from the Guard portal and coordinator desks.',
  'Evidence references, location, severity and event time in one record.',
  'Role-scoped verification, clarification requests and audit history.',
  'Agency referral packs for INEC, NPF, ICCES, DSS, NSCDC and other partners.',
  'Automatic Command alerts for new reports inside the user’s area.',
  'Early-warning tips that stay confidential until Command reviews them.',
]

function ErartPage() {
  return (
    <PublicShell>
      <section className="bg-ink py-14 text-white md:py-20">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Radio className="size-3.5" /> Early Warning &amp; Rapid Response
          </p>
          <h1 className="mt-5 max-w-4xl text-4xl font-black leading-tight md:text-5xl">
            YEGO Early Warning &amp; Rapid Response Tool
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-white/75">
            ERART is the digital reporting dashboard that enables Electoral Guards and coordinators to submit, document
            and share information that is verified and processed by established authorities, and to facilitate
            appropriate response action.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/login">
                Open the ERART dashboard <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white">
              <Link to="/apply">Apply as a YEGO Volunteer</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <p className="text-sm font-bold uppercase tracking-wider text-primary">The reporting chain</p>
          <h2 className="mt-1 text-2xl font-black md:text-3xl">From a field report to an appropriate response</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <article key={step.title} className="rounded-lg border bg-card p-5">
                <div className="flex items-center justify-between">
                  <step.icon className="size-6 text-primary" />
                  <span className="font-display text-xs font-black text-muted-foreground">0{index + 1}</span>
                </div>
                <h3 className="mt-3 font-bold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y bg-card py-12 md:py-16">
        <div className="mx-auto grid max-w-content gap-8 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-primary">What ERART does</p>
            <h2 className="mt-1 text-2xl font-black md:text-3xl">One verified information chain</h2>
            <ul className="mt-5 space-y-3">
              {CAPABILITIES.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border bg-background p-6">
            <h3 className="flex items-center gap-2 font-black">
              <BellRing className="size-5 text-primary" /> ERART and ERARM
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              ERART is the reporting and documentation dashboard. It feeds the Early-Warning Rapid Response Mechanism
              (ERARM), the verification and escalation process that links credible reports to the authorities responsible
              for a response.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Who reports</p>
                <p className="mt-1 text-sm font-semibold">Certified Guards, coordinators and Command desks</p>
              </div>
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Who acts</p>
                <p className="mt-1 text-sm font-semibold">Verification officers and established authorities</p>
              </div>
            </div>
            <div className="mt-5 rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
              ERART does not publish reports automatically. Every incident is reviewed before referral, and every action
              is recorded in the audit trail.
            </div>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
          <div>
            <h2 className="text-2xl font-black">Ready to report?</h2>
            <p className="text-sm text-muted-foreground">
              Sign in with your Guard or Command account. Applicants can track their status without signing in.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/login">Sign in to ERART</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/status">Check application status</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
