// Outbound notifications: Meta WhatsApp Cloud API and Twilio SMS.
//
// Every outbound message is recorded in `outbound_messages` before delivery is
// attempted, so the audit trail is truthful even when no provider is
// configured (the row is then marked `skipped`). Delivery never blocks or
// breaks the business workflow: it runs after the caller's transaction has
// committed and every failure is caught.
//
// Providers are selected purely from environment variables:
//   META_WHATSAPP_TOKEN + META_WHATSAPP_PHONE_NUMBER_ID  → WhatsApp via Meta
//   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (+ TWILIO_FROM_NUMBER or
//   TWILIO_MESSAGING_SERVICE_SID)                        → SMS via Twilio
//   NOTIFY_CHANNEL=auto|whatsapp|sms (default auto: WhatsApp if configured,
//   otherwise SMS) and NOTIFY_DISABLED=1 to turn the whole channel off.

import { query, one } from './db.server'
import { normalizePhone } from './security.server'

export type OutboundChannel = 'sms' | 'whatsapp'

export interface NotifyConfig {
  twilio: {
    accountSid: string
    authToken: string
    from: string | null
    messagingServiceSid: string | null
  } | null
  meta: { token: string; phoneNumberId: string } | null
  preference: 'auto' | 'sms' | 'whatsapp'
  disabled: boolean
}

export function notifyConfig(env: NodeJS.ProcessEnv = process.env): NotifyConfig {
  const disabled = env.NOTIFY_DISABLED === '1' || env.NOTIFY_DISABLED === 'true'
  const twilio =
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && (env.TWILIO_FROM_NUMBER || env.TWILIO_MESSAGING_SERVICE_SID)
      ? {
          accountSid: env.TWILIO_ACCOUNT_SID,
          authToken: env.TWILIO_AUTH_TOKEN,
          from: env.TWILIO_FROM_NUMBER ?? null,
          messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID ?? null,
        }
      : null
  const meta =
    env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID
      ? {
          token: env.META_WHATSAPP_TOKEN,
          phoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID,
        }
      : null
  const preference = env.NOTIFY_CHANNEL === 'sms' || env.NOTIFY_CHANNEL === 'whatsapp' ? env.NOTIFY_CHANNEL : 'auto'
  return { twilio, meta, preference, disabled }
}

/** Choose the channel for the next message given the configured providers. */
export function resolveChannel(config: NotifyConfig): OutboundChannel | null {
  if (config.disabled) return null
  if (config.preference === 'whatsapp') return config.meta ? 'whatsapp' : null
  if (config.preference === 'sms') return config.twilio ? 'sms' : null
  if (config.meta) return 'whatsapp'
  if (config.twilio) return 'sms'
  return null
}

/** Normalised Nigerian mobile → E.164 (+234…), the format both providers expect. */
export function toE164(phone: string): string {
  const local = normalizePhone(phone)
  if (local.startsWith('0')) return `+234${local.slice(1)}`
  if (local.startsWith('234')) return `+${local}`
  return `+${local}`
}

/* Provider request builders (pure, unit-testable) -------------------------- */

export interface ProviderRequest {
  url: string
  headers: Record<string, string>
  body: string
}

export function buildTwilioRequest(
  config: NonNullable<NotifyConfig['twilio']>,
  to: string,
  body: string,
): ProviderRequest {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')
  const form = new URLSearchParams({ To: to, Body: body })
  if (config.messagingServiceSid) form.set('MessagingServiceSid', config.messagingServiceSid)
  if (config.from) form.set('From', config.from)
  return {
    url,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  }
}

export function parseTwilioResponse(payload: { sid?: string; message?: string }): {
  id: string | null
  error: string | null
} {
  if (payload.sid) return { id: payload.sid, error: null }
  return { id: null, error: payload.message ?? 'Twilio rejected the message.' }
}

export function buildMetaWhatsAppRequest(
  config: NonNullable<NotifyConfig['meta']>,
  to: string,
  body: string,
): ProviderRequest {
  return {
    url: `https://graph.facebook.com/v21.0/${encodeURIComponent(config.phoneNumberId)}/messages`,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body },
    }),
  }
}

export function parseMetaWhatsAppResponse(payload: { messages?: { id: string }[]; error?: { message?: string } }): {
  id: string | null
  error: string | null
} {
  if (payload.messages?.[0]?.id) return { id: payload.messages[0].id, error: null }
  return {
    id: null,
    error: payload.error?.message ?? 'Meta rejected the message.',
  }
}

/* Templates ---------------------------------------------------------------- */

export type NotifyTemplate = 'application.received' | 'application.status' | 'applicant.message'

export function renderTemplate(
  template: NotifyTemplate,
  vars: {
    applicationId?: string
    status?: string
    note?: string
    title?: string
    body?: string
  },
): string {
  switch (template) {
    case 'application.received':
      return `YEGO: Application received. Your ID is ${vars.applicationId}. Keep it safe — you will need it with your phone number to track your progress.`
    case 'application.status': {
      const suffix = vars.note ? ` Note: ${vars.note}` : ''
      return `YEGO: Application ${vars.applicationId} is now "${vars.status}".${suffix}`
    }
    case 'applicant.message':
      return `YEGO message${vars.title ? ` — ${vars.title}` : ''}: ${vars.body}`
  }
}

/* Queue + delivery --------------------------------------------------------- */

export interface QueueInput {
  channel: OutboundChannel
  toPhone: string
  template: NotifyTemplate
  body: string
  relatedType?: string
  relatedId?: string
}

export async function queueMessage(input: QueueInput): Promise<string | null> {
  const config = notifyConfig()
  if (config.disabled) return null
  try {
    const row = await one<{ id: string }>(
      `insert into outbound_messages (channel, to_phone, template, body, related_type, related_id, status, provider)
       values ($1,$2,$3,$4,$5,$6,'queued',$7) returning id`,
      [
        input.channel,
        input.toPhone,
        input.template,
        input.body,
        input.relatedType ?? null,
        input.relatedId ?? null,
        input.channel === 'sms' ? 'twilio' : 'meta',
      ],
    )
    return row?.id ?? null
  } catch {
    // Notification must never break the business workflow.
    return null
  }
}

type FetchImpl = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

async function deliverOne(id: string, fetchImpl: FetchImpl): Promise<'sent' | 'failed' | 'skipped'> {
  const row = await one<{
    channel: OutboundChannel
    to_phone: string
    body: string
    attempts: number
  }>(
    "select channel, to_phone, body, attempts from outbound_messages where id = $1 and status in ('queued', 'failed')",
    [id],
  )
  if (!row) return 'skipped'

  const config = notifyConfig()
  const channel = resolveChannel(config)
  if (!channel || channel !== row.channel) {
    await query(`update outbound_messages set status = 'skipped', error = $2, attempts = attempts + 1 where id = $1`, [
      id,
      config.disabled ? 'Notifications are disabled (NOTIFY_DISABLED).' : 'No provider configured for this channel.',
    ])
    return 'skipped'
  }

  const to = toE164(row.to_phone)
  const request =
    channel === 'sms'
      ? buildTwilioRequest(config.twilio!, to, row.body)
      : buildMetaWhatsAppRequest(config.meta!, to, row.body)

  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })
    const payload = (await response.json().catch(() => ({}))) as never
    const parsed = channel === 'sms' ? parseTwilioResponse(payload) : parseMetaWhatsAppResponse(payload)
    if (parsed.id) {
      await query(
        `update outbound_messages set status = 'sent', provider_message_id = $2, error = null, attempts = attempts + 1, sent_at = now() where id = $1`,
        [id, parsed.id],
      )
      return 'sent'
    }
    await query(`update outbound_messages set status = 'failed', error = $2, attempts = attempts + 1 where id = $1`, [
      id,
      parsed.error,
    ])
    return 'failed'
  } catch (error) {
    await query(`update outbound_messages set status = 'failed', error = $2, attempts = attempts + 1 where id = $1`, [
      id,
      error instanceof Error ? error.message : 'Delivery error.',
    ])
    return 'failed'
  }
}

/** Queue and then attempt delivery in the background. Never throws. */
export async function queueAndDeliver(input: Omit<QueueInput, 'channel'>): Promise<void> {
  const config = notifyConfig()
  const channel = resolveChannel(config)
  if (!channel) {
    // Record the skipped attempt truthfully so Command can audit what would
    // have been sent once a provider is configured.
    const resolved: OutboundChannel = config.preference === 'sms' ? 'sms' : 'whatsapp'
    try {
      await query(
        `insert into outbound_messages (channel, to_phone, template, body, related_type, related_id, status, error)
         values ($1,$2,$3,$4,$5,$6,'skipped',$7)`,
        [
          resolved,
          input.toPhone,
          input.template,
          input.body,
          input.relatedType ?? null,
          input.relatedId ?? null,
          config.disabled
            ? 'Notifications are disabled (NOTIFY_DISABLED).'
            : 'No messaging provider is configured yet.',
        ],
      )
    } catch {
      /* ignore */
    }
    return
  }
  const id = await queueMessage({ ...input, channel })
  if (!id) return
  // Opportunistic immediate delivery; queued rows are retried on the next send.
  void deliverOne(id, globalThis.fetch as FetchImpl).catch(() => {})
}

/** Retry queued/failed messages (failed rows stop after 5 attempts). */
export async function processPendingMessages(limit = 20, fetchImpl: FetchImpl = globalThis.fetch as FetchImpl) {
  const rows = (
    await query<{ id: string }>(
      `select id from outbound_messages
       where (status = 'queued' or (status = 'failed' and attempts < 5))
       order by created_at limit $1`,
      [limit],
    )
  ).rows
  const results = { sent: 0, failed: 0, skipped: 0 }
  for (const row of rows) {
    const outcome = await deliverOne(row.id, fetchImpl)
    results[outcome === 'sent' ? 'sent' : outcome === 'failed' ? 'failed' : 'skipped'] += 1
  }
  return results
}
