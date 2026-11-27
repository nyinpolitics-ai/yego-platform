import { createFileRoute, isNotFound, Link, notFound, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { ArrowLeft, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ContentArticle } from '@/components/yego/article'
import { PublicShell } from '@/components/yego/site-shell'
import { SITE_URL } from '@/lib/config'
import { getPublicContentBySlugFn } from '@/server/functions'

export const Route = createFileRoute('/news/$slug')({
  loader: async ({ params }) => {
    // Server-side visibility rule: only published public content is fetchable
    // here; drafts, restricted and archived items are a plain 404.
    try {
      const item = await getPublicContentBySlugFn({ data: { slug: params.slug } })
      if (!item) throw notFound()
      return item
    } catch (error) {
      // The router's own not-found signal passes through untouched.
      if (isNotFound(error)) throw error

      // A genuinely missing public article (the server's 404) and a malformed
      // slug rejected by validation are both a plain 404 for the visitor — the
      // visibility rule must keep hiding unpublished/restricted items.
      const status = (error as { status?: number } | null | undefined)?.status
      const message = error instanceof Error ? error.message : String(error ?? '')
      if (status === 404 || status === 400 || message === 'Content not found.' || message === 'Invalid input.') {
        throw notFound()
      }

      // Unexpected server failure (database, runtime): log the cause server-side
      // and surface a safe, retryable error page — never raw internals.
      console.error(`[news/$slug] article lookup failed for slug "${params.slug}"`, error)
      throw new Error('The news article could not be loaded. Please try again shortly.', { cause: error })
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.title} · YEGO` : 'Not found · YEGO' },
      ...(loaderData
        ? [
            { name: 'description', content: loaderData.summary || loaderData.title },
            { property: 'og:title', content: `${loaderData.title} · YEGO` },
            { property: 'og:description', content: loaderData.summary || loaderData.title },
            { property: 'og:type', content: 'article' },
            { property: 'og:url', content: `${SITE_URL}/news/${loaderData.slug}` },
            ...(loaderData.featuredImage
              ? [{ property: 'og:image', content: loaderData.featuredImage }]
              : []),
          ]
        : []),
    ],
  }),
  component: ArticlePage,
  notFoundComponent: ArticleNotFoundPage,
  errorComponent: ArticleErrorPage,
})

/** Dark strip with the back link, shared by every article-page state. */
function ArticleTopBar() {
  return (
    <section className="bg-ink py-8 text-white">
      <div className="mx-auto max-w-content px-4 sm:px-6">
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="-ml-2 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Link to="/news">
            <ArrowLeft /> All news &amp; updates
          </Link>
        </Button>
      </div>
    </section>
  )
}

function ArticlePage() {
  const item = Route.useLoaderData()
  return (
    <PublicShell>
      <ArticleTopBar />
      <section className="py-8 md:py-12">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <ContentArticle item={item} />
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

/** 404: the article does not exist or is not publicly available. */
function ArticleNotFoundPage() {
  return (
    <PublicShell>
      <ArticleTopBar />
      <section className="py-10 md:py-16">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-lg border bg-card p-10 text-center">
            <p className="text-sm font-semibold text-muted-foreground">404</p>
            <h1 className="mt-2 text-2xl font-black">Article not found</h1>
            <p className="mt-2 text-muted-foreground">
              This update doesn’t exist, or it isn’t publicly available. It may have been unpublished or archived.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/news">All news &amp; updates</Link>
              </Button>
              <Button variant="outline" asChild>
                <a href="/">Go home</a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

/** Unexpected failure: safe, retryable state — no internals are shown. */
function ArticleErrorPage({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <PublicShell>
      <ArticleTopBar />
      <section className="py-10 md:py-16">
        <div className="mx-auto max-w-content px-4 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-lg border bg-card p-10 text-center">
            <h1 className="text-2xl font-black">This article couldn’t load</h1>
            <p role="alert" className="mt-2 text-muted-foreground">
              Something went wrong on our side — it isn’t the link’s fault. Please try again in a moment.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                onClick={() => {
                  void router.invalidate()
                  reset()
                }}
              >
                <RefreshCw /> Try again
              </Button>
              <Button variant="outline" asChild>
                <Link to="/news">All news &amp; updates</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
