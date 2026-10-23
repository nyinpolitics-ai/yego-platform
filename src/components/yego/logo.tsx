import { cn } from '@/lib/utils'

export const YEGO_LOGO_SRC = '/img/yego-logo.jpg'

export function YegoMark({ className }: { className?: string }) {
  return (
    <img
      src={YEGO_LOGO_SRC}
      alt=""
      aria-hidden="true"
      width={40}
      height={40}
      className={cn('size-10 shrink-0 rounded-full bg-white object-contain', className)}
    />
  )
}

export function YegoLogo({
  className,
  inverted = false,
}: {
  className?: string
  inverted?: boolean
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <YegoMark />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-display text-xl font-black tracking-tight',
            inverted ? 'text-white' : 'text-foreground',
          )}
        >
          YEGO
        </span>
        <span
          className={cn(
            'text-[10px] font-semibold uppercase tracking-[0.14em]',
            inverted ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          Electoral Guards
        </span>
      </span>
    </span>
  )
}
