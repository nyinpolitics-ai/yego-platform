import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, CalendarDays, ExternalLink, Newspaper } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PublicShell } from '@/components/yego/site-shell'
import { fmtDate } from '@/lib/format'
import { NEWS, NEWS_TAGS, type NewsTag } from '@/lib/news'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/news')({
  head: () => ({ meta: [{ title: 'News and updates · YEGO' }] }),
  component: NewsPage,
})

type Filter = 'All' | NewsTag

function NewsPage() {
  const [filter, setFilter] = useState<Filter>('All')
  const items = useMemo(() => (filter === 'All' ? NEWS : NEWS.filter((item) => item.tag === filter)), [filter])

  return (
    <PublicShell>
      <section className="bg-ink py-14 text-white md:py-20">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Newspaper className="size-3.5" /> News &amp; updates
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            Engagements, partnerships and press coverage.
          </h1>
          <p className="mt-4 max-w-2xl text-white/75">
            Statements, media reports and partnership announcements from the Youth Electoral Guards Observers and the
            wider YEAPA coalition. Every item links to its original source where one is available.
          </p>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="flex flex-wrap gap-2" aria-label="Filter news">
            {(['All', ...NEWS_TAGS] as Filter[]).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setFilter(tag)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  filter === tag ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                )}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item, index) => (
              <article
                key={item.id}
                className={cn(
                  'flex flex-col rounded-lg border bg-card p-6',
                  index === 0 && filter === 'All' && 'md:col-span-2 xl:col-span-2',
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
                    {item.tag}
                  </span>
                  {item.date ? (
                    <time className="flex items-center gap-1 text-muted-foreground" dateTime={item.date}>
                      <CalendarDays className="size-3.5" /> {fmtDate(item.date)}
                    </time>
                  ) : (
                    <span className="text-muted-foreground">Press release</span>
                  )}
                </div>

                <h2 className={cn('mt-3 font-black leading-snug', index === 0 && filter === 'All' ? 'text-2xl' : 'text-lg')}>
                  {item.title}
                </h2>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.excerpt}</p>

                {item.links?.length ? (
                  <ul className="mt-4 space-y-1.5 border-t pt-3">
                    {item.links.map((link) => (
                      <li key={link.url}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                        >
                          <ExternalLink className="size-3.5 shrink-0" /> {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">{item.source}</p>
                )}
              </article>
            ))}
          </div>

          {items.length === 0 && (
            <p className="mt-10 rounded-lg border bg-card p-6 text-center text-muted-foreground">
              No updates in this category yet.
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-secondary p-5">
            <div>
              <p className="font-black">Want to join the mission?</p>
              <p className="text-sm text-secondary-foreground">
                Applications are open to non-partisan Nigerians aged 18 and above.
              </p>
            </div>
            <Button asChild>
              <Link to="/apply">
                Apply as YEGO Volunteer <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
