import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Building2, Mail, Phone, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PublicShell } from '@/components/yego/site-shell'
import { PARTNERS, PARTNER_CATEGORIES, PARTNER_CONTACTS, type Partner } from '@/lib/partners'

export const Route = createFileRoute('/partners')({
  head: () => ({ meta: [{ title: 'Partners · YEGO' }] }),
  component: PartnersPage,
})

function PartnerCard({ partner }: { partner: Partner }) {
  return (
    <article className="flex flex-col rounded-lg border bg-card p-5">
      <div className="grid h-24 place-items-center rounded-md bg-white p-2">
        <img
          src={partner.logo}
          alt={`${partner.name} logo`}
          className="max-h-20 max-w-full object-contain"
          loading="lazy"
        />
      </div>
      <h3 className="mt-4 font-bold leading-snug">{partner.name}</h3>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-primary">{partner.category}</p>
      <p className="mt-2 text-sm text-muted-foreground">{partner.summary}</p>
    </article>
  )
}

function PartnersPage() {
  return (
    <PublicShell>
      <section className="bg-ink py-14 text-white md:py-20">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Users className="size-3.5" /> Strategic partners
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            One election. Many institutions. A shared commitment to credibility.
          </h1>
          <p className="mt-4 max-w-2xl text-white/75">
            YEGO works with youth networks, security and civic institutions, and national bodies. This page lists the
            strategic partners named in the YEGO partnership brief. Recruitment target: 50,000 Master Trainers and
            300,000 Democratic Accountability Volunteers across over 176,000 polling units.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['50,000', 'Master Trainer target'],
              ['300,000', 'Democratic Accountability Volunteers (target)'],
              ['36 + FCT', 'States covered'],
              ['176,846', 'Polling units in scope'],
            ].map(([value, label]) => (
              <div key={label} className="border-t border-white/15 pt-3">
                <p className="font-display text-2xl font-black">{value}</p>
                <p className="text-xs uppercase tracking-wider text-white/60">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-primary">The coalition</p>
              <h2 className="mt-1 text-2xl font-black md:text-3xl">Strategic partners</h2>
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              Nine partner marks as published in the YEGO partnership brief, spanning security, peacebuilding, youth
              participation and civic networks.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {PARTNERS.map((partner) => (
              <PartnerCard key={partner.id} partner={partner} />
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {PARTNER_CATEGORIES.map((category) => (
              <span
                key={category}
                className="rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground"
              >
                {category}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y bg-card py-12 md:py-16">
        <div className="mx-auto grid max-w-content gap-8 px-4 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-primary">Institutional position</p>
            <h2 className="mt-1 text-2xl font-black md:text-3xl">Non-partisan. Independent. Accountable.</h2>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>YEGO is a youth-led citizens’ observation, vigilance and early-warning initiative.</li>
              <li>It does not support or campaign for any political party or candidate.</li>
              <li>Partner marks do not imply endorsement of any party or candidate.</li>
              <li>Observation findings are verified before referral or publication.</li>
            </ul>
            <Button asChild className="mt-5">
              <Link to="/apply">
                Apply as a YEGO Volunteer <ArrowRight />
              </Link>
            </Button>
          </div>

          <div className="rounded-lg border bg-background p-5">
            <h3 className="flex items-center gap-2 font-black">
              <Building2 className="size-4 text-primary" /> Partnership desk
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              For partnership, funding or institutional coordination, contact the programme office.
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              {PARTNER_CONTACTS.map((contact) => (
                <li key={contact.label} className="flex items-start gap-2">
                  {contact.href.startsWith('tel:') ? (
                    <Phone className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : (
                    <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
                  )}
                  <span>
                    <span className="block text-xs uppercase tracking-wider text-muted-foreground">{contact.label}</span>
                    <a href={contact.href} className="font-semibold text-primary hover:underline">
                      {contact.value}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="rounded-lg border border-dashed bg-secondary p-5 text-sm text-secondary-foreground">
            <strong>About these marks.</strong> Partner logos are reproduced from the YEGO partnership brief supplied for
            this project. Each partner’s preferred name, mark and approved description should be confirmed before public
            launch; no partner is presented as endorsing a political party or candidate.
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
