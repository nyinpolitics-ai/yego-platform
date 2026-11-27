import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, CalendarDays, ExternalLink, MapPin, Newspaper, Search, Video } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PublicShell } from '@/components/yego/site-shell'
import { CONTENT_CATEGORIES, type ContentTeaser } from '@/lib/content'
import { listPublicContentFn } from '@/server/functions'
import { NEWS, NEWS_TAGS, type NewsTag } from '@/lib/news'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Index route for /news — the News & Updates listing. It is a child of the
 * `/news` layout route (`news.tsx`), so the full article route
 * (`news.$slug`) can replace this page instead of rendering underneath it.
 */
export const Route = createFileRoute('/news/')({
  validateSearch: (search: Record<string, unknown>): { category?: string; q?: string; page?: number } => ({
    category:
      typeof search.category === 'string' && (CONTENT_CATEGORIES as readonly string[]).includes(search.category)
        ? search.category
        : undefined,
    q: typeof search.q === 'string' && search.q.trim() ? search.q.trim().slice(0, 120) : undefined,
    page: typeof search.page === 'number' && Number.isInteger(search.page) && search.page > 1 ? search.page : undefined,
  }),
  loaderDeps: ({ search }) => ({ category: search.category, q: search.q, page: search.page }),
  loader: async ({ deps }) => {
    return await listPublicContentSafe(deps.category, deps.q, deps.page ?? 1)
  },
  head: () => ({ meta: [{ title: 'News & Updates · YEGO' }] }),
  component: NewsPage,
})

type Filter = 'All' | NewsTag

/** Loader wrapper: an empty database must never break the public news page. */
async function listPublicContentSafe(category: string | undefined, q: string | undefined, page: number) {
  try {
    return await listPublicContentFn({ data: { category, q, page } })
  } catch {
    return { rows: [] as ContentTeaser[], totalRows: 0, page, pageSize: 12 }
  }
}

function NewsPage() {
  const { rows, totalRows, page, pageSize } = Route.useLoaderData()
  const { category, q } = Route.useSearch()
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState(q ?? '')
  const [lastUrlQuery, setLastUrlQuery] = useState(q ?? '')

  // Keep the search box in sync when the URL changes (e.g. browser back) by
  // adjusting state during render — the React-recommended pattern.
  if ((q ?? '') !== lastUrlQuery) {
    setLastUrlQuery(q ?? '')
    setSearchText(q ?? '')
  }

  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const [featured, ...latest] = rows

  function updateSearch(next: { category?: string; q?: string; page?: number }) {
    void navigate({
      to: '/news',
      search: {
        category: next.category || undefined,
        q: next.q?.trim() ? next.q.trim() : undefined,
        page: next.page && next.page > 1 ? next.page : undefined,
      },
    })
  }

  return (
    <PublicShell>
      <section className="bg-ink py-14 text-white md:py-20">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Newspaper className="size-3.5" /> News &amp; updates
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            Official news, announcements and updates from YEGO.
          </h1>
          <p className="mt-4 max-w-2xl text-white/75">
            Publications from the YEGO secretariat: news, announcements, training information, videos, programmes and
            upcoming events — plus press coverage from partners and media houses.
          </p>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          {/* Category filters + search for CMS publications */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" aria-label="Filter publications">
              <button
                type="button"
                onClick={() => updateSearch({ category: undefined, page: 1 })}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  !category ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                )}
              >
                All
              </button>
              {CONTENT_CATEGORIES.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => updateSearch({ category: tag, page: 1 })}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    category === tag ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
            <form
              className="relative w-full max-w-xs"
              onSubmit={(event) => {
                event.preventDefault()
                updateSearch({ q: searchText, page: 1 })
              }}
            >
              <Search className="absolute bottom-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                placeholder="Search publications…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                aria-label="Search publications"
              />
            </form>
          </div>

          {rows.length === 0 ? (
            <p className="mt-8 rounded-lg border bg-card p-6 text-center text-muted-foreground">
              No published items here yet{q || category ? ' — try another category or search.' : '.'}
            </p>
          ) : (
            <>
              {featured && !category && !q && <FeaturedCard item={featured} />}
              <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', featured && !category && !q && 'mt-4')}>
                {(featured && (category || q) ? rows : latest).map((item) => (
                  <TeaserCard key={item.id} item={item} />
                ))}
              </div>
            </>
          )}

          {pageCount > 1 && (
            <div className="mt-8 flex items-center justify-between text-sm">
              <p className="text-muted-foreground">
                Page {page} of {pageCount} · {totalRows} publications
              </p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => updateSearch({ category, q: q ?? undefined, page: page - 1 })}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pageCount}
                  onClick={() => updateSearch({ category, q: q ?? undefined, page: page + 1 })}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Curated press coverage supplied by the secretariat (unchanged source) */}
          <div className="mt-14">
            <h2 className="text-2xl font-black">Press coverage &amp; partnerships</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Media reports and partner announcements about YEGO. Every item links to its original source.
            </p>
            <PressGrid />
          </div>

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

function FeaturedCard({ item }: { item: ContentTeaser }) {
  return (
    <Link
      to="/news/$slug"
      params={{ slug: item.slug }}
      className="group grid gap-5 overflow-hidden rounded-lg border bg-card p-5 transition-colors hover:bg-muted/40 md:grid-cols-[280px_1fr] md:p-6"
    >
      {item.featuredImage ? (
        <img src={item.featuredImage} alt="" className="h-44 w-full rounded-md border object-cover md:h-full" />
      ) : null}
      <div className="min-w-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">{item.category}</span>
          {item.publishedAt && (
            <time className="flex items-center gap-1 text-muted-foreground" dateTime={item.publishedAt}>
              <CalendarDays className="size-3.5" /> {fmtDate(item.publishedAt)}
            </time>
          )}
          {item.eventStartAt && (
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <CalendarDays className="size-3.5" /> {fmtDate(item.eventStartAt)}
            </span>
          )}
          {item.videoUrl && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Video className="size-3.5" /> Video
            </span>
          )}
        </div>
        <h2 className="mt-3 text-2xl font-black leading-snug">{item.title}</h2>
        {item.summary && <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.summary}</p>}
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
          Read the full update <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

function TeaserCard({ item }: { item: ContentTeaser }) {
  return (
    <Link
      to="/news/$slug"
      params={{ slug: item.slug }}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:bg-muted/40"
    >
      {item.featuredImage && <img src={item.featuredImage} alt="" className="h-40 w-full border-b object-cover" />}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">{item.category}</span>
          {item.publishedAt && (
            <time className="flex items-center gap-1 text-muted-foreground" dateTime={item.publishedAt}>
              <CalendarDays className="size-3.5" /> {fmtDate(item.publishedAt)}
            </time>
          )}
          {item.videoUrl && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Video className="size-3.5" /> Video
            </span>
          )}
        </div>
        <h2 className="mt-3 text-lg font-black leading-snug">{item.title}</h2>
        {item.summary && <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.summary}</p>}
        {item.eventStartAt && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <CalendarDays className="size-3.5 text-primary" /> {fmtDate(item.eventStartAt)}
            {item.eventLocation && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5 text-primary" /> {item.eventLocation}
              </span>
            )}
          </p>
        )}
        <span className="mt-4 inline-flex items-center gap-1.5 border-t pt-3 text-sm font-bold text-primary">
          Read more <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

function PressGrid() {
  const [tag, setTag] = useState<Filter>('All')
  const items = tag === 'All' ? NEWS : NEWS.filter((item) => item.tag === tag)
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2" aria-label="Filter press coverage">
        {(['All', ...NEWS_TAGS] as Filter[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTag(item)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              tag === item ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="flex flex-col rounded-lg border bg-card p-6">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">{item.tag}</span>
              {item.date ? (
                <time className="flex items-center gap-1 text-muted-foreground" dateTime={item.date}>
                  <CalendarDays className="size-3.5" /> {fmtDate(item.date)}
                </time>
              ) : (
                <span className="text-muted-foreground">Press release</span>
              )}
            </div>
            <h3 className="mt-3 text-lg font-black leading-snug">{item.title}</h3>
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
    </div>
  )
}
