import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Award, BookOpenCheck, CheckCircle2, Clock, GraduationCap, Lock, PlayCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PublicShell } from '@/components/yego/site-shell'
import { TRAINING_MODULES } from '@/lib/fixtures'

export const Route = createFileRoute('/training')({
  head: () => ({ meta: [{ title: 'Training Centre · YEGO' }] }),
  component: TrainingPage,
})

const totalMinutes = TRAINING_MODULES.reduce((sum, module) => sum + module.minutes, 0)
const totalQuestions = TRAINING_MODULES.reduce((sum, module) => sum + module.quiz.length, 0)

const OUTCOMES = [
  'Understand the observer’s role, ethics and the YEGO Code of Conduct.',
  'Apply the Electoral Act 2022 and INEC guidelines at the polling unit.',
  'Recognise early-warning indicators and escalate them safely.',
  'Capture location, time and evidence without putting yourself at risk.',
]

function TrainingPage() {
  return (
    <PublicShell>
      <section className="bg-ink py-14 text-white md:py-20">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <GraduationCap className="size-3.5" /> Training Centre
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            YEGO National Training Centre
          </h1>
          <p className="mt-2 font-display text-xl font-bold text-accent">The Electoral Accountability Academy</p>
          <p className="mt-3 max-w-2xl text-white/75">
            Training Today’s Youth. Protecting Tomorrow’s Democracy. {TRAINING_MODULES.length} modules, about{' '}
            {totalMinutes} minutes, built for a phone. Each module ends with a short assessment; pass all of them to
            unlock certification and deployment readiness.
          </p>
          <div className="mt-8 flex flex-wrap gap-6 text-sm">
            <span className="flex items-center gap-2">
              <BookOpenCheck className="size-4 text-accent" /> {TRAINING_MODULES.length} modules
            </span>
            <span className="flex items-center gap-2">
              <Clock className="size-4 text-accent" /> {totalMinutes} minutes
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-accent" /> {totalQuestions} assessment questions
            </span>
            <span className="flex items-center gap-2">
              <Award className="size-4 text-accent" /> Printable certificate
            </span>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-primary">The curriculum</p>
              <h2 className="mt-1 text-2xl font-black md:text-3xl">From ethics to evidence</h2>
              <div className="mt-6 space-y-3">
                {TRAINING_MODULES.map((module, index) => (
                  <article key={module.id} className="rounded-lg border bg-card p-5">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-display text-sm font-black text-primary-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
                            {module.kind}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" /> {module.minutes} min
                          </span>
                          <span>{module.quiz.length}-question assessment</span>
                        </div>
                        <h3 className="mt-1 font-bold">{module.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{module.summary}</p>
                      </div>
                      <span className="text-muted-foreground">
                        {module.kind === 'Video' ? <PlayCircle className="size-5" /> : <BookOpenCheck className="size-5" />}
                      </span>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-8 rounded-lg border bg-card p-5">
                <h3 className="font-black">What you will be able to do</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {OUTCOMES.map((outcome) => (
                    <li key={outcome} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {outcome}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-lg border bg-card p-5">
                <h3 className="flex items-center gap-2 font-black">
                  <Lock className="size-4 text-primary" /> When training unlocks
                </h3>
                <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>1. Submit an application and confirm it on WhatsApp.</li>
                  <li>2. Your State desk reviews and screens the application.</li>
                  <li>3. Once approved, the modules appear in your Guard portal.</li>
                  <li>4. Pass all modules to complete training and become eligible for certification.</li>
                </ol>
                <Button asChild className="mt-4 w-full">
                  <Link to="/apply">
                    Apply as YEGO Volunteer <ArrowRight />
                  </Link>
                </Button>
              </div>

              <div className="rounded-lg border-2 border-dashed border-primary bg-secondary p-5 text-center">
                <Award className="mx-auto size-8 text-primary" />
                <h3 className="mt-2 font-black">Certificate of Completion</h3>
                <p className="mt-1 text-sm text-secondary-foreground">
                  Certified Guards receive a printable certificate carrying their name, YEGO ID and issue date.
                </p>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <h3 className="font-black">Already applied?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in with your Application ID and phone number to continue training.
                </p>
                <Button asChild variant="outline" className="mt-3 w-full">
                  <Link to="/login">Open the Guard portal</Link>
                </Button>
                <Button asChild variant="ghost" className="mt-1 w-full">
                  <Link to="/status">Check application status</Link>
                </Button>
              </div>
            </aside>
          </div>
          <div className="mt-10 rounded-lg border bg-card p-5 md:p-6">
            <p className="text-sm font-bold uppercase tracking-wider text-primary">Training and certification process</p>
            <h3 className="mt-1 text-2xl font-black">Eight steps from application to coordination</h3>
            <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Register', 'Complete the YEGO application form.'],
                ['Screening', 'YEGO reviews the application and verifies identity and eligibility.'],
                ['Enrolment', 'Approved applicants receive access to the Training Dashboard.'],
                ['Training', 'Complete the required modules at your own pace on a phone.'],
                ['Assessment', 'Take the module quizzes and the final assessment.'],
                ['Certification', 'Meet the standard and receive a YEGO training certificate.'],
                ['Deployment readiness', 'Complete briefing, role assignment and field checks.'],
                ['Coordination', 'Linked to the relevant state and LGA coordination structure.'],
              ].map(([title, body], index) => (
                <li key={title} className="rounded-md border bg-background p-3">
                  <span className="font-display text-xs font-black text-primary">0{index + 1}</span>
                  <p className="mt-1 text-sm font-bold">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>

        </div>
      </section>
    </PublicShell>
  )
}
