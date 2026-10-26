import { Link } from '@tanstack/react-router'
import { LogIn, Menu, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useDB } from '@/lib/demo-store'
import { EMERGENCY_PHONE_DISPLAY, EMERGENCY_PHONE_TEL } from '@/lib/config'
import { YegoLogo } from './logo'

const NAV = [
  { href: '/#about', label: 'About' },
  { href: '/#how', label: 'How it works' },
  { href: '/erart', label: 'Early warning' },
  { href: '/map', label: 'Coverage map' },
  { href: '/training', label: 'Training' },
  { href: '/news', label: 'News' },
  { href: '/#contact', label: 'Contact' },
]

export function SiteHeader() {
  const { session } = useDB()
  const portal = session?.kind === 'command' ? '/command' : '/portal'
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      {/* Official masthead */}
      <div className="bg-ink text-ink-foreground">
        <div className="mx-auto flex h-8 max-w-content items-center justify-between gap-4 px-4 text-[11px] font-medium tracking-wide sm:px-6">
          <p className="flex items-center gap-2 truncate">
            <span className="hidden sm:inline">Watch · Report · Protect</span>
            <span className="hidden sm:inline text-white/40" aria-hidden>
              |
            </span>
            <span className="truncate text-white/80">Non-partisan election observation mission</span>
          </p>
          <p className="flex shrink-0 items-center gap-1.5 text-white/80">
            Emergency (WhatsApp only):{' '}
            <a href={EMERGENCY_PHONE_TEL} className="font-bold text-white hover:underline">
              {EMERGENCY_PHONE_DISPLAY}
            </a>
          </p>
        </div>
      </div>
      <div className="h-1 bg-[linear-gradient(90deg,#0b6b3a_0_33%,#fff_33%_66%,#0b6b3a_66%)]" />
      <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="YEGO home">
          <YegoLogo />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/status">Check status</Link>
          </Button>
          {session ? (
            <Button asChild variant="outline" size="sm">
              <Link to={portal}>
                <ShieldCheck /> My dashboard
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/login">
                <LogIn /> Login
              </Link>
            </Button>
          )}
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link to="/apply">Apply as a YEGO Volunteer</Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>YEGO</SheetTitle>
                <SheetDescription>Watchdog of the Electoral Process</SheetDescription>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4" aria-label="Mobile">
                {NAV.map((n) => (
                  <a key={n.href} href={n.href} className="rounded-md px-3 py-2.5 font-medium hover:bg-secondary">
                    {n.label}
                  </a>
                ))}
                <Link to="/status" className="rounded-md px-3 py-2.5 font-medium hover:bg-secondary">
                  Check application status
                </Link>
                <Button asChild className="mt-3">
                  <Link to="/apply">Apply as a YEGO Volunteer</Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer id="contact" className="bg-ink text-ink-foreground">
      <div className="h-1 bg-[linear-gradient(90deg,#0b6b3a_0_33%,#fff_33%_66%,#0b6b3a_66%)]" />
      <div className="mx-auto grid max-w-content gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <YegoLogo inverted />
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Youth Electoral Guards Observers: Nigeria’s youth-led election observation, early-warning and accountability mission.
            Non-partisan. Independent. Peaceful.
          </p>
          <p className="mt-6 text-xs text-white/50">
            YEGO emergency line (WhatsApp only):{' '}
            <a href={EMERGENCY_PHONE_TEL} className="font-bold text-white hover:underline">
              {EMERGENCY_PHONE_DISPLAY}
            </a>
            . For life-threatening danger, call 112 (national emergency line) first.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">Contact</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>YEGO National Secretariat, Abuja</li>
            <li>
              <a className="hover:underline" href="mailto:info@yego.ng">info@yego.ng</a>
            </li>
            <li>
              <a className="hover:underline" href={EMERGENCY_PHONE_TEL}>
                Emergency (WhatsApp only): {EMERGENCY_PHONE_DISPLAY}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">Platform</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:underline" to="/apply">Apply as a YEGO Volunteer</Link></li>
            <li><Link className="hover:underline" to="/status">Check application status</Link></li>
            <li><Link className="hover:underline" to="/map">Coverage map</Link></li>
            <li><Link className="hover:underline" to="/partners">Partners</Link></li>
            <li><Link className="hover:underline" to="/training">Training Centre</Link></li>
            <li><Link className="hover:underline" to="/login">Guard & Command login</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-content px-4 py-5 text-xs text-white/50 sm:px-6">
          © {new Date().getFullYear()} Youth Electoral Guards Observers. Personal data is processed in line with the Nigeria Data Protection Act 2023.
        </p>
      </div>
    </footer>
  )
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
