// CMS shared model + pure helpers. Used by both the server layer and the UI.
//
// Security model for rendered content:
// - The body is PLAIN TEXT with a tiny inline syntax (**bold**, *italic*,
//   [label](https://url)). It is parsed into structured runs and rendered by
//   React, which escapes every string automatically. Raw HTML is never
//   rendered, so stored <script> payloads cannot execute.
// - Every URL (links, videos, resources) must be http(s). `javascript:`,
//   `data:` and other schemes are rejected here, before storage.
// - External video embeds are limited to YouTube and Vimeo, rendered through
//   the privacy-safe youtube-nocookie/player.vimeo.com origins.

export const CONTENT_CATEGORIES = [
  'News',
  'Announcements & Updates',
  'Training & Development',
  'Videos & Media',
  'Programs & Initiatives',
  'Upcoming Events',
] as const

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number]

export const CONTENT_AUDIENCES = ['public', 'applicants', 'guards', 'all'] as const
export type ContentAudience = (typeof CONTENT_AUDIENCES)[number]

export const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const AUDIENCE_LABELS: Record<ContentAudience, string> = {
  public: 'Public — everyone on the website',
  applicants: 'Applicants — authenticated applicants only',
  guards: 'Guards — authenticated Guards only',
  all: 'All portal users — applicants and Guards',
}

export const CATEGORY_DESCRIPTIONS: Record<ContentCategory, string> = {
  News: 'Press coverage, statements and official news',
  'Announcements & Updates': 'Important platform and programme updates',
  'Training & Development': 'Training schedules, materials and results',
  'Videos & Media': 'Videos, photos and media appearances',
  'Programs & Initiatives': 'YEGO programmes, campaigns and partnerships',
  'Upcoming Events': 'Scheduled events, dates and venues',
}

/** CMS content item exactly as stored (already mapped to camelCase). */
export interface ContentItem {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  category: ContentCategory
  audience: ContentAudience
  status: ContentStatus
  featuredImage?: string
  gallery: { name: string; data: string }[]
  attachments: { name: string; data: string }[]
  videoUrl?: string
  resourceUrl?: string
  eventStartAt?: string
  eventLocation?: string
  createdByLabel: string
  updatedByLabel?: string
  publishedAt?: string
  publishedByLabel?: string
  notifyInApp: boolean
  notifyEmail: boolean
  notificationSentAt?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

/** Public listing entry — no body, no recipient data. */
export interface ContentTeaser {
  id: string
  slug: string
  title: string
  summary: string
  category: ContentCategory
  featuredImage?: string
  videoUrl?: string
  eventStartAt?: string
  eventLocation?: string
  publishedAt?: string
  publishedByLabel?: string
}

/** URL-friendly slug: lowercase, hyphenated, ASCII letters/digits only. */
export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
  return base || 'untitled'
}

/**
 * Normalise an http(s)-only URL, or return null when the value is not a safe
 * web link (wrong scheme, credentials embedded, unparseable).
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const raw = value.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

export type EmbeddableVideo = { provider: 'youtube' | 'vimeo'; embedUrl: string }

/** Only YouTube and Vimeo may be embedded; everything else renders as a link. */
export function embeddableVideo(value: string | null | undefined): EmbeddableVideo | null {
  const url = safeHttpUrl(value)
  if (!url) return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (parsed.pathname === '/watch' && parsed.searchParams.get('v')) {
        return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${parsed.searchParams.get('v')}` }
      }
      const shorts = parsed.pathname.match(/^\/(?:shorts|embed)\/([\w-]{6,})/)
      if (shorts) return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${shorts[1]}` }
    }
    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1)
      if (/^[\w-]{6,}$/.test(id)) return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` }
    }
    if (host === 'vimeo.com') {
      const id = parsed.pathname.match(/^\/(\d{6,})/)
      if (id) return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id[1]}` }
    }
  } catch {
    return null
  }
  return null
}

/* Inline body syntax ------------------------------------------------------- */

export interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  link?: string
}

export type ContentBlock = { kind: 'p'; runs: InlineRun[] }

function parseEmphasis(text: string, base: Omit<InlineRun, 'text'>): InlineRun[] {
  const runs: InlineRun[] = []
  const boldRe = /\*\*([^*]+)\*\*/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = boldRe.exec(text))) {
    if (match.index > last) runs.push(...parseItalic(text.slice(last, match.index), base))
    runs.push(...parseItalic(match[1], { ...base, bold: true }))
    last = match.index + match[0].length
  }
  if (last < text.length) runs.push(...parseItalic(text.slice(last), base))
  return runs
}

function parseItalic(text: string, base: Omit<InlineRun, 'text'>): InlineRun[] {
  const runs: InlineRun[] = []
  const italicRe = /\*([^*]+)\*/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = italicRe.exec(text))) {
    if (match.index > last) pushText(runs, text.slice(last, match.index), base)
    pushText(runs, match[1], { ...base, italic: true })
    last = match.index + match[0].length
  }
  if (last < text.length) pushText(runs, text.slice(last), base)
  return runs
}

function pushText(runs: InlineRun[], text: string, base: Omit<InlineRun, 'text'>): void {
  if (!text) return
  const previous = runs[runs.length - 1]
  if (
    previous &&
    !!previous.bold === !!base.bold &&
    !!previous.italic === !!base.italic &&
    previous.link === base.link
  ) {
    previous.text += text
    return
  }
  runs.push({ text, ...base })
}

/**
 * Parse the plain-text body into safe structured blocks. The inline syntax is
 * `**bold**`, `*italic*` and `[label](https://url)`; links whose URL fails
 * `safeHttpUrl` are rendered as plain text. Everything else (raw HTML,
 * scripts) stays literal, escaped text.
 */
export function parseContentBody(body: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  for (const paragraph of body.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const trimmed = paragraph.replace(/^\n+|\n+$/g, '').trim()
    if (!trimmed) continue
    const runs: InlineRun[] = []
    const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g
    let last = 0
    let match: RegExpExecArray | null
    while ((match = linkRe.exec(trimmed))) {
      const url = safeHttpUrl(match[2])
      if (url) {
        if (match.index > last) runs.push(...parseEmphasis(trimmed.slice(last, match.index), {}))
        runs.push(...parseEmphasis(match[1].replace(/\n/g, ' '), { link: url }))
        last = match.index + match[0].length
      }
    }
    if (last < trimmed.length) runs.push(...parseEmphasis(trimmed.slice(last), {}))
    // Single newlines inside a paragraph become spaces: keeps the structured
    // rendering simple without allowing arbitrary line-level markup.
    for (const run of runs) run.text = run.text.replace(/\n/g, ' ')
    const flattened: InlineRun[] = []
    for (const run of runs) {
      if (!run.text) continue
      const previous = flattened[flattened.length - 1]
      if (
        previous &&
        !!previous.bold === !!run.bold &&
        !!previous.italic === !!run.italic &&
        previous.link === run.link
      ) {
        previous.text += run.text
        continue
      }
      flattened.push(run)
    }
    if (flattened.length) blocks.push({ kind: 'p', runs: flattened })
  }
  return blocks
}

/** Escape LIKE wildcards so user search text matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}
