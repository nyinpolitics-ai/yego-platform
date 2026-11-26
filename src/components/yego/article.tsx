// Shared renderer for a CMS content item. Used by the public News & Updates
// article page, the Command Centre preview and the portal. React escapes every
// string it renders, so the parsed body can never inject markup.
import { Fragment } from 'react'
import { CalendarDays, Download, ExternalLink, FileText, Link2, MapPin, UserRound } from 'lucide-react'

import { embeddableVideo, parseContentBody, safeHttpUrl, type ContentItem, type InlineRun } from '@/lib/content'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export function ArticleBody({ body, className }: { body: string; className?: string }) {
  const blocks = parseContentBody(body)
  if (!blocks.length) return null
  return (
    <div className={cn('space-y-4 text-[15px] leading-relaxed text-foreground/90', className)}>
      {blocks.map((block, blockIndex) => (
        <p key={blockIndex}>
          {block.runs.map((run, runIndex) => (
            <Fragment key={runIndex}>{renderRun(run)}</Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}

function renderRun(run: InlineRun) {
  let node: React.ReactNode = run.text
  if (run.italic) node = <em>{node}</em>
  if (run.bold) node = <strong className="font-bold text-foreground">{node}</strong>
  if (run.link) {
    node = (
      <a href={run.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
        {node}
      </a>
    )
  }
  return node
}

/** YouTube/Vimeo embed through privacy-safe origins; anything else is a link. */
export function VideoPlayer({ url, title }: { url?: string; title: string }) {
  if (!url) return null
  const video = embeddableVideo(url)
  if (video) {
    return (
      <div className="aspect-video overflow-hidden rounded-lg border bg-black">
        <iframe
          src={video.embedUrl}
          title={title}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    )
  }
  const link = safeHttpUrl(url)
  if (!link) return null
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
    >
      Watch the video <ExternalLink className="size-3.5" />
    </a>
  )
}

/**
 * The full article view for a stored content item. Only call it with items the
 * server has already authorised for the current viewer.
 */
export function ContentArticle({ item, className }: { item: ContentItem; className?: string }) {
  const resource = safeHttpUrl(item.resourceUrl)
  return (
    <article className={cn('space-y-5', className)}>
      {item.featuredImage && (
        <img src={item.featuredImage} alt="" className="max-h-[420px] w-full rounded-lg border object-cover" />
      )}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">{item.category}</span>
          {item.publishedAt && (
            <time dateTime={item.publishedAt} className="flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {fmtDate(item.publishedAt)}
            </time>
          )}
          {item.publishedByLabel && (
            <span className="flex items-center gap-1">
              <UserRound className="size-3.5" /> {item.publishedByLabel}
            </span>
          )}
          {item.eventStartAt && (
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <CalendarDays className="size-3.5" /> {fmtDateTime(item.eventStartAt)}
            </span>
          )}
          {item.eventLocation && (
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <MapPin className="size-3.5" /> {item.eventLocation}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-black leading-tight md:text-3xl">{item.title}</h1>
        {item.summary && <p className="text-base text-muted-foreground">{item.summary}</p>}
      </header>

      <VideoPlayer url={item.videoUrl} title={item.title} />
      <ArticleBody body={item.body} />

      {item.gallery.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {item.gallery.map((image, index) => (
            <img key={index} src={image.data} alt={image.name} className="aspect-square w-full rounded-lg border object-cover" />
          ))}
        </div>
      )}

      {item.attachments.length > 0 && (
        <ul className="space-y-2">
          {item.attachments.map((file, index) => (
            <li key={index}>
              <a
                href={file.data}
                download={file.name}
                className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm font-semibold hover:bg-muted"
              >
                <FileText className="size-4 shrink-0 text-primary" /> {file.name}
                <Download className="ml-auto size-4 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {resource && (
        <a
          href={resource}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80"
        >
          <Link2 className="size-4" /> Open the linked resource <ExternalLink className="size-3.5" />
        </a>
      )}
    </article>
  )
}
