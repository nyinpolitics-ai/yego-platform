import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BellRing,
  BookOpenCheck,
  ClipboardList,
  Eye,
  FileSearch,
  GraduationCap,
  MapPinned,
  Megaphone,
  Phone,
  Radio,
  Scale,
  ShieldCheck,
  Smartphone,
  UserPlus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PublicShell } from '@/components/yego/site-shell'
import { STATE_COVERAGE } from '@/lib/fixtures'
import { nf } from '@/lib/format'
import { TOTALS, ZONES } from '@/lib/nigeria'
import { PARTNERS } from '@/lib/partners'

export const Route = createFileRoute('/')({
  component: Home,
})

const img = (file: string) => `/img/${file}`

const JOURNEY = [
  { icon: UserPlus, title: 'Apply', body: 'Submit your details, photo and declaration online.' },
  { icon: ClipboardList, title: 'Profile', body: 'Your digital profile and Application ID are created.' },
  { icon: FileSearch, title: 'Screening', body: 'State desks review background and non-partisanship.' },
  { icon: BadgeCheck, title: 'Verification', body: 'NIN and identity are verified by authorised officers.' },
  { icon: GraduationCap, title: 'Training', body: 'Complete modules, videos and assessments on your phone.' },
  { icon: ShieldCheck, title: 'Certification', body: 'Receive your YEGO ID and certificate.' },
  { icon: MapPinned, title: 'Deployment', body: 'Get assigned to a polling unit near you.' },
]

const PILLARS = [
  { icon: Eye, title: 'Observe', body: 'Trained youth at polling units across every LGA, watching the process from accreditation to collation.' },
  { icon: BellRing, title: 'Warn early', body: 'Spot and escalate tension, threats and misinformation before they turn into violence.' },
  { icon: Radio, title: 'Report fast', body: 'Structured, evidence-backed incident reports from the field in under a minute.' },
  { icon: Scale, title: 'Hold to account', body: 'Verified findings referred to the right authorities and published responsibly.' },
]

// Real photographs from YEGO national engagements (field evidence of the
// mission at work — flag-off, press conferences, partner institutions).
const ENGAGEMENTS = [
  {
    file: 'flag-off-press-briefing.jpg',
    caption: 'National Flag-Off Ceremony of the YEGO election observation mission',
  },
  {
    file: 'national-engagement-group.jpg',
    caption: 'YEGO national engagement with security agencies and civic stakeholders',
  },
  {
    file: 'world-press-conference.jpg',
    caption: 'YEGO delegates at the World Press Conference',
  },
  {
    file: 'courtesy-visit.jpg',
    caption: 'Courtesy visit to a partner institution’s national office',
  },
  {
    file: 'stakeholder-handshake.jpg',
    caption: 'Stakeholder engagement ahead of election-day deployment',
  },
]

function Home() {
  const totalGuards = STATE_COVERAGE.reduce((n, s) => n + s.registered, 0)
  const covered = STATE_COVERAGE.reduce((n, s) => n + s.pusCovered, 0)

  return (
    <PublicShell>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-ink text-white">
        <img
          src={img('flag-off-press-briefing.jpg')}
          srcSet={`${img('flag-off-press-briefing.jpg')} 1080w`}
          sizes="100vw"
          alt="Delegates and media cameras at the YEGO National Flag-Off Ceremony"
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-45"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/85 to-ink/30" />
        <div className="mx-auto max-w-content px-4 py-20 sm:px-6 md:py-28">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <span className="size-2 rounded-full bg-accent" /> National recruitment is open
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.05] sm:text-5xl md:text-6xl">
            Youth Electoral Guards Observers
          </h1>
          <p className="mt-3 font-display text-2xl font-bold text-accent sm:text-3xl">
            Watchdog of the Electoral Process
          </p>
          <p className="mt-6 max-w-2xl text-lg text-white/80">
            Nigeria’s largest youth-led election observation and electoral vigilance mission: an early-warning and
            accountability initiative to curb electoral violence, promote peaceful participation and protect
            electoral integrity for credible elections.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/apply">
                Become a YEGO Guard <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white">
              <Link to="/status">Check application status</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
              <a href="#report">
                <AlertTriangle /> Report an incident
              </a>
            </Button>
          </div>
          <p className="mt-6 text-xs text-white/55">
            Pictured: YEGO National Flag-Off Ceremony — the mission’s national launch with partners and the media.
          </p>
        </div>
        <div className="border-t border-white/10 bg-ink/80">
          <dl className="mx-auto grid max-w-content grid-cols-2 gap-px px-4 sm:px-6 md:grid-cols-4">
            {[
              ['36 + FCT', 'States covered'],
              [nf.format(TOTALS.lgas), 'Local Government Areas'],
              [nf.format(TOTALS.wards), 'Registration areas (wards)'],
              [nf.format(TOTALS.pollingUnits), 'Polling units to watch'],
            ].map(([v, l]) => (
              <div key={l} className="py-5">
                <dt className="text-xs uppercase tracking-wider text-white/60">{l}</dt>
                <dd className="font-display text-2xl font-black sm:text-3xl">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* About + mission */}
      <section id="about" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto grid max-w-content gap-12 px-4 sm:px-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="official-eyebrow">About YEGO</p>
            <h2 className="mt-2 text-3xl font-black sm:text-4xl">Young Nigerians guarding the ballot, peacefully.</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="overflow-hidden rounded-lg border">
                <img
                  src={img('delegation-arrival.jpg')}
                  alt="YEGO delegation on arrival at a national engagement"
                  loading="lazy"
                  className="aspect-[3/4] w-full object-cover"
                />
              </div>
              <div className="overflow-hidden rounded-lg border">
                <img
                  src={img('partner-conference.jpg')}
                  alt="YEGO delegation at a partner conference"
                  loading="lazy"
                  className="aspect-[3/4] w-full object-cover"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              YEGO delegates at national engagements and partner conferences.
            </p>
            <p className="mt-4 text-muted-foreground">
              YEGO recruits, trains and deploys non-partisan youth volunteers to observe elections at polling-unit level in every
              state. Guards report what they see through a secure platform, where reports are verified before they are acted on
              and referred to the authorities responsible for a response.
            </p>
            <div id="mission" className="mt-8 rounded-lg border-l-4 border-primary bg-secondary p-5">
              <h3 className="font-bold">Our mission</h3>
              <p className="mt-1 text-sm text-secondary-foreground">
                To mobilise Nigerian youth as credible guardians of the electoral process, detecting risks early, reporting
                accurately and helping to keep elections free, fair, peaceful and credible.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
            {PILLARS.map((p) => (
              <div key={p.title} className="rounded-lg border bg-card p-6">
                <p.icon className="size-7 text-primary" />
                <h3 className="mt-4 text-lg font-bold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y bg-card py-16 md:py-24">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <p className="text-sm font-bold uppercase tracking-wider text-primary">How YEGO works</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black sm:text-4xl">From application to polling unit in seven steps</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
            {JOURNEY.map((s, i) => (
              <li key={s.title} className="relative rounded-lg border bg-background p-4">
                <span className="font-display text-xs font-black text-muted-foreground">0{i + 1}</span>
                <s.icon className="mt-2 size-6 text-primary" />
                <h3 className="mt-3 font-bold">{s.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { icon: Megaphone, t: 'Command & communication', b: 'National Command → State → LGA → Guard. Instructions and alerts reach the right people only.' },
              { icon: Smartphone, t: 'Election-Day Mode', b: 'Where? What? When? Evidence? Four taps to report, built for low-bandwidth phones.' },
              { icon: ShieldCheck, t: 'Verified before action', b: 'No report becomes an incident until a verification officer reviews the evidence.' },
            ].map((x) => (
              <div key={x.t} className="flex gap-4 rounded-lg bg-secondary p-5">
                <x.icon className="size-6 shrink-0 text-primary" />
                <div>
                  <h3 className="font-bold">{x.t}</h3>
                  <p className="mt-1 text-sm text-secondary-foreground">{x.b}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* On the ground — real engagements */}
      <section id="engagements" className="scroll-mt-20 border-y bg-card py-16 md:py-24">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <p className="official-eyebrow">On the ground</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black sm:text-4xl">The mission, seen at national engagements</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            From the National Flag-Off Ceremony to press conferences and partnership sessions with institutions that
            protect elections, YEGO works in the open — with security agencies, civic networks and the media.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ENGAGEMENTS.map((e) => (
              <figure key={e.file} className="group overflow-hidden rounded-lg border bg-background">
                <div className="aspect-[16/10] overflow-hidden">
                  <img
                    src={img(e.file)}
                    alt={e.caption}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <figcaption className="flex items-start gap-2 px-4 py-3 text-xs font-medium text-muted-foreground">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {e.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* National reach */}
      <section id="reach" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-primary">National reach</p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl">Every zone. Every state. Every LGA.</h2>
            </div>
            <Button asChild variant="outline">
              <Link to="/map">
                Open coverage map <MapPinned />
              </Link>
            </Button>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ZONES.map((z) => {
              const rows = STATE_COVERAGE.filter((s) => s.zone === z)
              const pus = rows.reduce((n, r) => n + r.pollingUnits, 0)
              const cov = rows.reduce((n, r) => n + r.pusCovered, 0)
              const pct = Math.round((cov / pus) * 100)
              return (
                <div key={z} className="rounded-lg border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">{z}</h3>
                    <span className="text-xs text-muted-foreground">{rows.length} states</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{rows.map((r) => r.state).join(' · ')}</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs">
                    <strong>{pct}%</strong> of {nf.format(pus)} polling units with a trained Guard (target)
                  </p>
                </div>
              )
            })}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Recruitment target: {nf.format(totalGuards)} Guards for {nf.format(covered)} priority polling units nationwide.
          </p>
        </div>
      </section>

      {/* Become a guard */}
      <section id="apply" className="scroll-mt-20 bg-primary py-16 text-primary-foreground md:py-20">
        <div className="mx-auto grid max-w-content items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-accent">Apply to become a YEGO Guard</p>
            <h2 className="mt-2 text-3xl font-black sm:text-4xl">Your community. Your vote. Your watch.</h2>
            <p className="mt-4 text-primary-foreground/85">
              Open to Nigerians aged 18–35 who are non-partisan, have a valid NIN, and can commit to training and deployment in
              their LGA. Applying takes about 8 minutes on a phone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/apply">
                  Start application <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link to="/status">Track my application</Link>
              </Button>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              'Valid National Identification Number (NIN)',
              'Smartphone with WhatsApp',
              'No party membership or campaign role',
              'Live photo or recent passport photo',
              'Agree to the YEGO Code of Conduct',
              'Available for training and election day',
            ].map((r) => (
              <li key={r} className="flex items-start gap-2 rounded-lg bg-white/10 p-4 text-sm">
                <BadgeCheck className="mt-0.5 size-5 shrink-0 text-accent" /> {r}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Report + training */}
      <section className="py-16 md:py-24">
        <div className="mx-auto grid max-w-content gap-6 px-4 sm:px-6 lg:grid-cols-2">
          <div id="report" className="scroll-mt-20 flex flex-col rounded-lg border bg-card p-6 md:p-8">
            <AlertTriangle className="size-8 text-destructive" />
            <h2 className="mt-4 text-2xl font-black">Report an incident</h2>
            <p className="mt-2 text-muted-foreground">
              Certified YEGO Guards report from their assigned polling unit through the secure Guard portal with location, time,
              and photo or video evidence. Reports go to verification officers and are never published automatically.
            </p>
            <div className="mt-6 rounded-lg bg-destructive/10 p-4 text-sm">
              <p className="flex items-center gap-2 font-bold text-destructive">
                <Phone className="size-4" /> Danger to life? Call 112 now.
              </p>
              <p className="mt-1 text-muted-foreground">
                Members of the public can also contact the Nigeria Police Force or INEC directly.
              </p>
            </div>
            <div className="mt-auto flex flex-wrap gap-3 pt-6">
              <Button asChild>
                <Link to="/login">Guard login to report</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/map">Locate a ward on the map</Link>
              </Button>
            </div>
          </div>
          <div id="training" className="scroll-mt-20 overflow-hidden rounded-lg border bg-card">
            <img
              src={img('training.png')}
              alt="YEGO training session in a community hall"
              loading="lazy"
              className="aspect-[16/8] w-full object-cover"
            />
            <div className="p-6 md:p-8">
              <BookOpenCheck className="size-8 text-primary" />
              <h2 className="mt-4 text-2xl font-black">Training Dashboard</h2>
              <p className="mt-2 text-muted-foreground">
                Videos, manuals, modules and quizzes on observer ethics, the Electoral Act 2022, early warning, evidence and data
                protection, followed by assessment and certification.
              </p>
              <Button asChild variant="outline" className="mt-6">
                <Link to="/training">
                  Explore the curriculum <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* News — headlines live on /news only */}
      <section id="news" className="scroll-mt-20 border-t bg-card py-12 md:py-16">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
          <div className="max-w-xl">
            <p className="text-sm font-bold uppercase tracking-wider text-primary">News &amp; updates</p>
            <h2 className="mt-2 text-3xl font-black">Engagements, partnerships and press coverage</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Statements, media reports and partnership announcements are published on the YEGO news page. This keeps
              the latest coverage in one place and every item linked to its original source.
            </p>
          </div>
          <Button asChild>
            <Link to="/news">
              Visit the news page <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      {/* Partners */}
      <section id="partners" className="scroll-mt-20 border-t bg-card py-16 md:py-20">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <p className="text-sm font-bold uppercase tracking-wider text-primary">Partners</p>
              <h2 className="mt-2 text-3xl font-black">Working with institutions that protect elections</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Ten strategic partners spanning security, peacebuilding, youth networks and national institutions — as
                listed in the YEGO partnership brief.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/partners">
                Meet the partners <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {PARTNERS.map((partner) => (
              <div key={partner.id} className="flex flex-col items-center rounded-lg border bg-background p-4 text-center">
                <div className="grid h-16 w-full place-items-center">
                  <img
                    src={partner.logo}
                    alt={`${partner.name} logo`}
                    className="max-h-14 max-w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <p className="mt-2 text-[11px] font-bold leading-tight">{partner.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
