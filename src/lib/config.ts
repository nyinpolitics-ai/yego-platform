// Organisation-level settings. Replace placeholders before launch.

// Official YEGO WhatsApp Channel (correction round 5: the officials' channel
// URL). Applicants join it immediately after applying; all further
// instructions are shared there. The build-time env var still wins if set.
export const WHATSAPP_CHANNEL_URL =
  (import.meta.env.VITE_WHATSAPP_CHANNEL_URL as string | undefined)?.trim() ||
  'https://whatsapp.com/channel/0029VbDQ7mo6xCST5F8gXq2A'

// Absolute site origin used for social share images and email links.
export const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.trim() || 'https://yego.ng'

// Image shown when a link to the site is shared on WhatsApp, X, Facebook, etc.
export const OG_IMAGE = `${SITE_URL}/img/og-yego.png`

// YEGO emergency line (WhatsApp only).
export const EMERGENCY_PHONE_DISPLAY = '+234 815 703 1718'
export const EMERGENCY_PHONE_TEL = 'tel:+2348157031718'
export const EMERGENCY_WHATSAPP_URL = 'https://wa.me/2348157031718'

export const MIN_AGE = 18
