import { describe, expect, it } from 'vitest'

import {
  CONTENT_CATEGORIES,
  embeddableVideo,
  escapeLike,
  parseContentBody,
  safeHttpUrl,
  slugify,
} from '@/lib/content'
import { ALL_CAPABILITIES, can } from '@/lib/permissions'

describe('slugify', () => {
  it('produces lowercase hyphenated ascii slugs', () => {
    expect(slugify('YEGO Opens Training Centres in Six States!')).toBe('yego-opens-training-centres-in-six-states')
  })
  it('strips apostrophes and punctuation', () => {
    expect(slugify("Democracy mustn't be blocked — 2027")).toBe('democracy-mustnt-be-blocked-2027')
  })
  it('falls back to untitled when nothing usable remains', () => {
    expect(slugify('///')).toBe('untitled')
  })
})

describe('safeHttpUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(safeHttpUrl('https://yego.ng/news')).toBe('https://yego.ng/news')
    expect(safeHttpUrl('http://example.com/a?b=1')).toBe('http://example.com/a?b=1')
  })
  it('rejects script and data schemes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
    expect(safeHttpUrl('vbscript:msgbox')).toBeNull()
  })
  it('rejects embedded credentials and garbage', () => {
    expect(safeHttpUrl('https://user:pass@yego.ng')).toBeNull()
    expect(safeHttpUrl('not a url')).toBeNull()
    expect(safeHttpUrl('')).toBeNull()
  })
})

describe('embeddableVideo', () => {
  it('maps YouTube URLs to the privacy-safe embed origin', () => {
    expect(embeddableVideo('https://www.youtube.com/watch?v=abc123456')?.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/abc123456',
    )
    expect(embeddableVideo('https://youtu.be/abc123456')?.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/abc123456',
    )
    expect(embeddableVideo('https://www.youtube.com/shorts/abc123456')?.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/abc123456',
    )
  })
  it('maps Vimeo URLs', () => {
    expect(embeddableVideo('https://vimeo.com/123456789')?.embedUrl).toBe('https://player.vimeo.com/video/123456789')
  })
  it('never embeds other providers', () => {
    expect(embeddableVideo('https://vimeo.com/everyone-loves-pizza')).toBeNull()
    expect(embeddableVideo('https://evil.example/video')).toBeNull()
    expect(embeddableVideo('javascript:alert(1)')).toBeNull()
  })
})

describe('parseContentBody (stored-XSS safety)', () => {
  it('keeps raw HTML as literal escaped text', () => {
    const blocks = parseContentBody('Hello <script>alert(1)</script> world')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].runs.map((run) => run.text).join('')).toBe('Hello <script>alert(1)</script> world')
  })

  it('parses bold, italic and paragraph breaks', () => {
    const blocks = parseContentBody('**Bold** and *quiet* start.\n\nSecond paragraph.')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].runs).toEqual([
      { text: 'Bold', bold: true },
      { text: ' and ' },
      { text: 'quiet', italic: true },
      { text: ' start.' },
    ])
  })

  it('parses safe links and drops unsafe ones to plain text', () => {
    const blocks = parseContentBody('[Site](https://yego.ng) and [bad](javascript:alert(1))')
    expect(blocks[0].runs).toEqual([
      { text: 'Site', link: 'https://yego.ng/' },
      { text: ' and [bad](javascript:alert(1))' },
    ])
  })

  it('rejects img-onerror style attribute injection inside link labels', () => {
    const blocks = parseContentBody('[<img src=x onerror=alert(1)>](https://yego.ng)')
    expect(blocks[0].runs[0]).toEqual({
      text: '<img src=x onerror=alert(1)>',
      link: 'https://yego.ng/',
    })
  })

  it('handles empty bodies', () => {
    expect(parseContentBody('')).toEqual([])
    expect(parseContentBody('\n\n  \n\n')).toEqual([])
  })
})

describe('escapeLike', () => {
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('100%_done\\path')).toBe('100\\%\\_done\\\\path')
  })
})

describe('content permission matrix', () => {
  const contentCaps = [
    'view:content',
    'create:content',
    'edit:content',
    'publish:content',
    'unpublish:content',
    'archive:content',
    'delete:content',
    'upload:media',
    'view:content-status',
  ] as const

  it('gives the Content Administrator exactly the content capabilities', () => {
    for (const cap of contentCaps) {
      expect(can('Content Administrator', cap), cap).toBe(true)
    }
  })

  it('gives the Content Administrator no operational or people-data capabilities', () => {
    for (const cap of ALL_CAPABILITIES.filter((c) => !(contentCaps as readonly string[]).includes(c))) {
      expect(can('Content Administrator', cap), cap).toBe(false)
    }
  })

  it('keeps the Super Administrator in full control of content and accounts', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(can('Super Administrator', cap), cap).toBe(true)
    }
  })

  it('covers every fixed category of the CMS', () => {
    expect(CONTENT_CATEGORIES).toEqual([
      'News',
      'Announcements & Updates',
      'Training & Development',
      'Videos & Media',
      'Programs & Initiatives',
      'Upcoming Events',
    ])
  })
})
