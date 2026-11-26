// Portal "News & updates": published CMS content the server has filtered for
// this viewer (public + their audience). Full items are only available after
// that server-side filter, so restricted content cannot leak to the client.
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ExternalLink, Loader2, MapPin, Newspaper, Video } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ContentArticle } from '@/components/yego/article'
import type { ContentItem } from '@/lib/content'
import { listPortalContent } from '@/lib/demo-store'
import { fmtDate } from '@/lib/format'

export function PortalUpdates({
  openId,
}: {
  /** Notification-driven: auto-open this content item once loaded. */
  openId?: string | null
}) {
  const [items, setItems] = useState<ContentItem[] | null>(null)
  const [open, setOpen] = useState<ContentItem | null>(null)
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listPortalContent()
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Derive the active item at render time: a notification-driven openId opens
  // the referenced item once it is loaded, until the user dismisses it.
  const autoOpen =
    openId && openId !== dismissedId && items ? (items.find((entry) => entry.id === openId) ?? null) : null
  const active = useMemo(() => open ?? autoOpen, [open, autoOpen])

  if (!items) {
    return (
      <p className="flex items-center gap-2 rounded-lg border bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading updates…
      </p>
    )
  }

  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <Newspaper className="size-4 text-primary" /> No publications yet
        </p>
        <p className="mt-1">News, announcements and training updates from YEGO will appear here.</p>
      </div>
    )
  }

  return (
    <>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(item)}
              className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
                  {item.category}
                </span>
                {item.publishedAt && (
                  <time className="flex items-center gap-1 text-muted-foreground" dateTime={item.publishedAt}>
                    <CalendarDays className="size-3.5" /> {fmtDate(item.publishedAt)}
                  </time>
                )}
                {item.eventStartAt && (
                  <span className="flex items-center gap-1 font-semibold text-foreground">
                    <CalendarDays className="size-3.5 text-primary" /> {fmtDate(item.eventStartAt)}
                  </span>
                )}
                {item.eventLocation && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="size-3.5" /> {item.eventLocation}
                  </span>
                )}
                {item.videoUrl && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Video className="size-3.5" /> Video
                  </span>
                )}
              </div>
              <p className="mt-1.5 font-bold">{item.title}</p>
              {item.summary && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>}
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={!!active}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(null)
            setDismissedId(openId ?? null)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{active?.title}</DialogTitle>
            {active?.audience !== 'public' && (
              <DialogDescription>Shared with the {active?.audience === 'all' ? 'whole portal' : `${active?.audience} audience`}.</DialogDescription>
            )}
          </DialogHeader>
          {active && <ContentArticle item={active} />}
          <DialogFooter className="flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Published by the YEGO secretariat.</p>
            {active?.audience === 'public' && active && (
              <Button asChild size="sm" variant="outline">
                <a href={`/news/${active.slug}`}>
                  View on the website <ExternalLink />
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
