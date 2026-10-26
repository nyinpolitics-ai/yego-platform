import { useState } from 'react'
import { Award, BookOpen, CheckCircle2, Lock, PlayCircle, Printer } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { YegoMark } from '@/components/yego/logo'
import { submitTrainingQuiz } from '@/lib/demo-store'
import { TRAINING_MODULES, type Application } from '@/lib/fixtures'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const N = TRAINING_MODULES.length

export function TrainingCentre({ app }: { app: Application }) {
  const unlocked = ['Training Required', 'Training Completed', 'Certified/Active'].includes(app.status)
  const passed = Math.round((app.trainingProgress / 100) * N)
  const registrationStatus = ['Application Submitted', 'Under Review', 'Screening'].includes(app.status)
    ? 'Pending'
    : 'Verified'
  const trainingStatus =
    app.trainingProgress === 0 ? 'Not Started' : app.trainingProgress >= 100 ? 'Completed' : 'In Progress'
  const certificationStatus =
    app.status === 'Certified/Active' ? 'Issued' : app.trainingProgress >= 100 ? 'Eligible' : 'Pending'
  const [open, setOpen] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)

  if (!unlocked) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-center">
        <Lock className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-2 font-semibold">Training unlocks after approval</p>
        <p className="text-sm text-muted-foreground">Once screening and verification are complete, your modules appear here.</p>
      </div>
    )
  }

  const mod = TRAINING_MODULES.find((m) => m.id === open)

  async function submitQuiz() {
    if (!mod) return
    setBusy(true)
    try {
      const ordered = mod.quiz.map((_, index) => answers[index] ?? -1)
      const result = await submitTrainingQuiz(mod.id, ordered)
      if (!result.passed) {
        toast.error('Some answers are incorrect. Review the module and try again.')
        return
      }
      toast.success(`Module ${TRAINING_MODULES.indexOf(mod) + 1} passed`)
      setOpen(null)
      setAnswers({})
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit the assessment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">YEGO National Training Centre</p>
        <h2 className="mt-1 font-display text-xl font-black">The Electoral Accountability Academy</h2>
        <p className="text-sm text-muted-foreground">Training Today’s Youth. Protecting Tomorrow’s Democracy.</p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ['Registration', registrationStatus],
            ['Training', trainingStatus],
            ['Modules completed', `${passed} of ${N}`],
            ['Assessment score', app.assessmentScore == null ? 'Pending' : `${app.assessmentScore}%`],
            ['Certification', certificationStatus],
            ['Assigned state', `${app.stateOfResidence} / ${app.lga}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border bg-background p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-sm font-bold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Course progress</span>
          <span>
            {passed}/{N} modules
          </span>
        </div>
        <Progress value={app.trainingProgress} className="mt-2" />
      </div>

      {mod ? (
        <div className="rounded-lg border bg-card p-5">
          <p className="text-xs font-bold uppercase text-primary">{mod.kind} · {mod.minutes} min</p>
          <h3 className="mt-1 text-lg font-black">{mod.title}</h3>
          <div className="mt-4 grid aspect-video place-items-center rounded-lg bg-ink text-white/80">
            <span className="flex flex-col items-center gap-2 text-sm">
              {mod.kind === 'Video' ? <PlayCircle className="size-12" /> : <BookOpen className="size-12" />}
              {mod.kind === 'Video' ? 'Training video' : 'Training manual'}
            </span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{mod.summary}</p>
          <h4 className="mt-6 font-bold">Assessment</h4>
          <div className="mt-3 space-y-4">
            {mod.quiz.map((q, i) => (
              <fieldset key={q.q}>
                <legend className="text-sm font-semibold">
                  {i + 1}. {q.q}
                </legend>
                <div className="mt-2 grid gap-2">
                  {q.options.map((o, j) => (
                    <label key={o} className={cn('flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm', answers[i] === j && 'border-primary bg-secondary')}>
                      <input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers({ ...answers, [i]: j })} className="accent-[var(--primary)]" />
                      {o}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <Button onClick={() => void submitQuiz()} disabled={busy || Object.keys(answers).length < mod.quiz.length}>
              Submit answers
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(null); setAnswers({}) }}>
              Back to modules
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {TRAINING_MODULES.map((m, i) => {
            const done = i < passed
            const available = i <= passed
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => setOpen(m.id)}
                  className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {done ? <CheckCircle2 className="size-6 shrink-0 text-primary" /> : available ? <PlayCircle className="size-6 shrink-0 text-accent-foreground" /> : <Lock className="size-6 shrink-0 text-muted-foreground" />}
                  <span className="flex-1">
                    <span className="block font-semibold">{i + 1}. {m.title}</span>
                    <span className="block text-xs text-muted-foreground">{m.kind} · {m.minutes} min · {m.quiz.length}-question quiz</span>
                  </span>
                  <span className="text-xs font-semibold">{done ? 'Passed' : available ? 'Start' : 'Locked'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {app.status === 'Certified/Active' && <Certificate app={app} />}
    </div>
  )
}

export function Certificate({ app }: { app: Application }) {
  const certifiedAt = [...app.history].reverse().find((h) => h.action === 'Certified/Active')?.at ?? app.submittedAt
  return (
    <div className="rounded-lg border-4 border-double border-primary bg-card p-6 text-center print:border-black" id="certificate">
      <YegoMark className="mx-auto size-24" />
      <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Youth Electoral Guards Observers</p>
      <h3 className="mt-2 font-display text-2xl font-black">Certificate of Completion</h3>
      <p className="mt-3 text-sm text-muted-foreground">This certifies that</p>
      <p className="font-display text-xl font-black">{app.fullName}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        has completed the YEGO Guard training programme and is certified for deployment as an electoral observer.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-6 text-xs">
        <span>
          <Award className="mr-1 inline size-4 text-primary" /> YEGO ID: <strong className="font-mono">{app.yegoId}</strong>
        </span>
        <span>Issued: {fmtDate(certifiedAt)}</span>
      </div>
      <Button variant="outline" size="sm" className="mt-4 print:hidden" onClick={() => window.print()}>
        <Printer /> Print / save PDF
      </Button>
    </div>
  )
}
