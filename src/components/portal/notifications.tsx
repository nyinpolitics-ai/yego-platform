// Notification bell for the portal (applicants + Guards). Same persistent
// notification records as Command, rendered for portal users with read/unread
// state, mark-all-as-read and navigation to the referenced content.
import { useEffect, useRef, useState } from 'react'
import { BellRing, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { markNotificationsRead, useDB } from '@/lib/demo-store'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PortalNotifications({ onOpenContent }: { onOpenContent?: (contentId: string) => void }) {
  const { notifications } = useDB()
  const [open, setOpen] = useState(false)
  const announced = useRef(new Set<string>())

  const unread = notifications.filter((item) => !item.read)

  useEffect(() => {
    // Announce brand-new content notifications once, like Command alerts.
    const fresh = notifications.filter((item) => !item.read && item.kind === 'content' && !announced.current.has(item.id))
    if (!fresh.length) return
    fresh.forEach((item) => announced.current.add(item.id))
    toast.info(fresh[0].title, {
      description: 'New update from YEGO — open the bell to read it.',
    })
  }, [notifications])

  async function markAllRead() {
    const ids = unread.map((item) => item.id)
    if (!ids.length) return
    try {
      await markNotificationsRead(ids)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update notifications.')
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="relative" onClick={() => setOpen(true)} aria-label="Notifications">
        <BellRing />
        <span className="hidden sm:inline">Updates</span>
        {unread.length > 0 && (
          <span className="ml-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="size-5 text-primary" /> Your notifications
            </DialogTitle>
            <DialogDescription>Messages and updates from YEGO for your account.</DialogDescription>
          </DialogHeader>

          {notifications.length === 0 ? (
            <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul className="space-y-2">
              {notifications.slice(0, 30).map((item) => (
                <li
                  key={item.id}
                  className={cn('rounded-lg border p-3', !item.read ? 'border-primary/40 bg-secondary/50' : 'opacity-75')}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wide">
                      {item.kind === 'content' ? 'YEGO update' : item.kind.replace('_', ' ')}
                    </span>
                    <time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
                  </div>
                  <p className="mt-1 text-sm font-bold">{item.title}</p>
                  {item.body && <p className="text-sm text-muted-foreground">{item.body}</p>}
                  {item.kind === 'content' && item.entityId && (
                    <Button
                      size="sm"
                      variant="link"
                      className="mt-1 h-auto p-0"
                      onClick={() => {
                        setOpen(false)
                        onOpenContent?.(item.entityId as string)
                      }}
                    >
                      Read the update
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={() => void markAllRead()} disabled={!unread.length}>
              <CheckCheck /> Mark all as read
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
