import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ContentArticle } from '@/components/yego/article'
import { PublicShell } from '@/components/yego/site-shell'
import { SITE_URL } from '@/lib/config'
import { getPublicContentBySlugFn } from '@/server/functions'

export const Route = createFileRoute('/news/$slug')({
  loader: async ({ params }) => {
    // Server-side visibility rule: only published public content is fetchable
    // here; drafts, restricted and archived items are a plain 404.
    const item = await getPublicContentBySlugFn({ data: { slug: params.slug } }).catch(() => null)
    if (!item) throw notFound()
    return item
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
})

function ArticlePage() {
  const item = Route.useLoaderData()
  return (
    <PublicShell>
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
