// Outbound notifications: Meta WhatsApp Cloud API, Twilio SMS and Resend email.
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
//   RESEND_API_KEY + NOTIFY_EMAIL_FROM                   → Email via Resend
//   NOTIFY_CHANNEL=auto|whatsapp|sms (default auto: WhatsApp if configured,
//   otherwise SMS) and NOTIFY_DISABLED=1 to turn the whole channel off.

import { query, one } from './db.server'
import { normalizePhone } from './security.server'

export type OutboundChannel = 'sms' | 'whatsapp' | 'email'

export interface NotifyConfig {
  twilio: {
    accountSid: string
    authToken: string
    from: string | null
    messagingServiceSid: string | null
  } | null
  meta: { token: string; phoneNumberId: string } | null
  email: { apiKey: string; from: string } | null
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
  const email =
    env.RESEND_API_KEY && env.NOTIFY_EMAIL_FROM
      ? { apiKey: env.RESEND_API_KEY, from: env.NOTIFY_EMAIL_FROM }
      : null
  const preference = env.NOTIFY_CHANNEL === 'sms' || env.NOTIFY_CHANNEL === 'whatsapp' ? env.NOTIFY_CHANNEL : 'auto'
  return { twilio, meta, email, preference, disabled }
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

export function buildResendRequest(
  config: NonNullable<NotifyConfig['email']>,
  to: string,
  subject: string,
  text: string,
  html?: string,
): ProviderRequest {
  return {
    url: 'https://api.resend.com/emails',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: config.from, to: [to], subject, text, html: html ?? undefined }),
  }
}

export function parseResendResponse(payload: { id?: string; message?: string }): {
  id: string | null
  error: string | null
} {
  if (payload.id) return { id: payload.id, error: null }
  return { id: null, error: payload.message ?? 'The email provider rejected the message.' }
}

/* Templates ---------------------------------------------------------------- */

export type NotifyTemplate =
  | 'application.received'
  | 'application.status'
  | 'applicant.message'
  | 'application.email_verification'

/** Templates rendered to short SMS/WhatsApp bodies. */
export type SmsNotifyTemplate = Exclude<NotifyTemplate, 'application.email_verification'>

export interface EmailMessage {
  subject: string
  text: string
  html?: string
}

/** Escape untrusted values (name, IDs) before interpolating into HTML mail. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface ApplicationConfirmationEmailInput {
  fullName: string
  applicationId: string
  phone: string
  verifyUrl: string
  loginUrl: string
  statusUrl: string
  siteUrl: string
}

/**
 * The single confirmation email every applicant receives after submitting:
 * confirmation + Application ID, the applicant's actual login details
 * (Application ID as username, application phone number as initial password)
 * and the one-time email-verification button. Rendered for both HTML and
 * plain-text mail clients; never includes the NIN or other sensitive data.
 */
export function renderApplicationConfirmationEmail(
  input: ApplicationConfirmationEmailInput,
): EmailMessage {
  const subject = 'Your YEGO Volunteer Application Has Been Received'
  const name = escapeHtml(input.fullName)
  const appId = escapeHtml(input.applicationId)
  const phone = escapeHtml(input.phone)

  const text = [
    `Dear ${input.fullName},`,
    '',
    'Thank you for applying to become a volunteer with Youth Electoral Guards Observers (YEGO).',
    '',
    'We are pleased to confirm that your application has been received successfully. Please keep',
    'your Application ID safe, as you will need it to access your applicant account and check the',
    'progress of your application.',
    '',
    'YOUR APPLICATION DETAILS',
    `Application ID: ${input.applicationId}`,
    '',
    'YOUR YEGO LOGIN DETAILS',
    `Username: ${input.applicationId}`,
    `Password: ${input.phone}`,
    `Login here: ${input.loginUrl}`,
    '',
    'Use the username and password displayed above to log in to your YEGO applicant account.',
    'For security, you will be asked to choose your own password the first time you sign in.',
    '',
    'VERIFY YOUR EMAIL ADDRESS',
    'Please click the button labelled "Verify My Email Address" (or open this link) to verify your email',
    'address and activate your applicant login access:',
    input.verifyUrl,
    '',
    'YEGO WEBSITE',
    `Visit: ${input.siteUrl}`,
    '',
    'APPLICANT LOGIN',
    `Sign in here: ${input.loginUrl}`,
    '',
    `You can also check the progress of your application at: ${input.statusUrl}`,
    '',
    'Please keep your login details private and do not share them with anyone.',
    '',
    'Submitting an application does not automatically mean that you have been selected or',
    'approved. Your application will proceed through the established YEGO screening,',
    'verification, training, and certification process.',
    '',
    'Thank you for your interest in joining YEGO and contributing to peaceful, credible, and',
    'transparent elections in Nigeria.',
    '',
    'Regards,',
    'YEGO National Secretariat',
    'Youth Electoral Guards Observers',
    `Website: ${input.siteUrl}`,
    'Email: info@yego.ng',
  ].join('\n')

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef2ef;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Application ${input.applicationId} received — verify your email address to activate your applicant login.</div>
  <div style="max-width:600px;margin:0 auto;padding:16px">
    <div style="background:#0b6b3a;border-radius:12px 12px 0 0;padding:22px 28px">
      <span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:2px">YEGO</span>
      <span style="color:#f5c542;font-size:12px;font-weight:600;margin-left:10px;letter-spacing:0.5px">Youth Electoral Guards Observers</span>
    </div>
    <div style="background:#ffffff;border:1px solid #dde5df;border-top:none;padding:28px 28px 24px">
      <p style="margin:0 0 14px;color:#17281f;font-size:16px;font-weight:bold">Dear ${name},</p>
      <p style="margin:0 0 12px;color:#3c4a42;font-size:14px;line-height:1.65">
        Thank you for applying to become a volunteer with Youth Electoral Guards Observers (YEGO).
      </p>
      <p style="margin:0 0 18px;color:#3c4a42;font-size:14px;line-height:1.65">
        We are pleased to confirm that your application has been received successfully. Please keep your
        Application ID safe, as you will need it to access your applicant account and check the progress of
        your application.
      </p>

      <p style="margin:0 0 8px;color:#0b6b3a;font-size:13px;font-weight:bold;letter-spacing:1px">YOUR APPLICATION DETAILS</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #dde5df;border-radius:8px;margin:0 0 20px">
        <tr><td style="padding:12px 16px;color:#3c4a42;font-size:14px">Application ID</td>
        <td style="padding:12px 16px;text-align:right"><span style="font-family:Courier New,monospace;font-size:16px;font-weight:bold;color:#17281f">${appId}</span></td></tr>
      </table>

      <p style="margin:0 0 8px;color:#0b6b3a;font-size:13px;font-weight:bold;letter-spacing:1px">YOUR YEGO LOGIN DETAILS</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #dde5df;border-radius:8px;margin:0 0 10px">
        <tr><td style="padding:10px 16px;color:#3c4a42;font-size:14px">Username</td>
        <td style="padding:10px 16px;text-align:right"><span style="font-family:Courier New,monospace;font-size:15px;font-weight:bold;color:#17281f">${appId}</span></td></tr>
        <tr style="border-top:1px solid #eef2ef"><td style="padding:10px 16px;color:#3c4a42;font-size:14px">Password</td>
        <td style="padding:10px 16px;text-align:right"><span style="font-family:Courier New,monospace;font-size:15px;font-weight:bold;color:#17281f">${phone}</span></td></tr>
      </table>
      <p style="margin:0 0 6px;color:#3c4a42;font-size:14px">Login here: <a href="${input.loginUrl}" style="color:#0b6b3a;font-weight:bold">${input.loginUrl}</a></p>
      <p style="margin:0 0 18px;color:#5b6a61;font-size:13px;line-height:1.6">
        Use the username and password displayed above to log in to your YEGO applicant account.
        For security, you will be asked to choose your own password the first time you sign in.
      </p>

      <p style="margin:0 0 8px;color:#0b6b3a;font-size:13px;font-weight:bold;letter-spacing:1px">VERIFY YOUR EMAIL ADDRESS</p>
      <p style="margin:0 0 14px;color:#3c4a42;font-size:14px;line-height:1.65">
        Please click the button below to verify your email address and activate your applicant login access.
      </p>
      <p style="margin:0 0 18px">
        <a href="${input.verifyUrl}" style="display:inline-block;background:#0b6b3a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;font-size:15px">Verify My Email Address</a>
      </p>
      <p style="margin:0 0 20px;color:#8a978f;font-size:12px;line-height:1.6">
        If the button does not work, copy this link into your browser:<br>
        <a href="${input.verifyUrl}" style="color:#0b6b3a;word-break:break-all">${input.verifyUrl}</a>
      </p>

      <p style="margin:0 0 6px;color:#3c4a42;font-size:14px"><span style="font-weight:bold">YEGO WEBSITE</span><br>Visit: <a href="${input.siteUrl}" style="color:#0b6b3a">${input.siteUrl}</a></p>
      <p style="margin:0 0 6px;color:#3c4a42;font-size:14px"><span style="font-weight:bold">APPLICANT LOGIN</span><br>Sign in here: <a href="${input.loginUrl}" style="color:#0b6b3a">${input.loginUrl}</a></p>
      <p style="margin:0 0 18px;color:#3c4a42;font-size:14px;line-height:1.65">
        You can also check the progress of your application by visiting the website's application-status page:<br>
        <a href="${input.statusUrl}" style="color:#0b6b3a">${input.statusUrl}</a>
      </p>

      <div style="border-top:1px solid #eef2ef;padding-top:16px">
        <p style="margin:0 0 10px;color:#5b6a61;font-size:13px;line-height:1.65">
          Please keep your login details private and do not share them with anyone.
        </p>
        <p style="margin:0 0 10px;color:#5b6a61;font-size:13px;line-height:1.65">
          Submitting an application does not automatically mean that you have been selected or approved.
          Your application will proceed through the established YEGO screening, verification, training, and
          certification process.
        </p>
        <p style="margin:0 0 18px;color:#5b6a61;font-size:13px;line-height:1.65">
          Thank you for your interest in joining YEGO and contributing to peaceful, credible, and transparent
          elections in Nigeria.
        </p>
        <p style="margin:0;color:#17281f;font-size:13px;line-height:1.7">
          Regards,<br>
          <strong>YEGO National Secretariat</strong><br>
          Youth Electoral Guards Observers<br>
          Website: <a href="${input.siteUrl}" style="color:#0b6b3a">${input.siteUrl}</a><br>
          Email: info@yego.ng
        </p>
      </div>
    </div>
    <p style="margin:0;padding:14px 8px;text-align:center;color:#8a978f;font-size:11px;line-height:1.6">
      You received this email because a YEGO volunteer application was submitted with this email address.
      If you did not apply, please ignore this message or contact info@yego.ng.
    </p>
  </div>
</body></html>`
  return { subject, text, html }
}

export function renderTemplate(
  template: SmsNotifyTemplate,
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
      return `YEGO: Application received. Your ID is ${vars.applicationId}. Keep it safe; you will need it with your phone number to track your progress.`
    case 'application.status': {
      const suffix = vars.note ? ` Note: ${vars.note}` : ''
      return `YEGO: Application ${vars.applicationId} is now "${vars.status}".${suffix}`
    }
    case 'applicant.message':
      return vars.title ? `YEGO ${vars.title}: ${vars.body}` : `YEGO message: ${vars.body}`
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
  const phoneRows = (
    await query<{ id: string }>(
      `select id from outbound_messages
       where channel in ('sms', 'whatsapp')
         and (status = 'queued' or (status = 'failed' and attempts < 5))
       order by created_at limit $1`,
      [limit],
    )
  ).rows
  const results = { sent: 0, failed: 0, skipped: 0 }
  for (const row of phoneRows) {
    const outcome = await deliverOne(row.id, fetchImpl)
    results[outcome === 'sent' ? 'sent' : outcome === 'failed' ? 'failed' : 'skipped'] += 1
  }
  const emailRows = (
    await query<{ id: string }>(
      `select id from outbound_messages
       where channel = 'email'
         and (status = 'queued' or (status = 'failed' and attempts < 5))
       order by created_at limit $1`,
      [limit],
    )
  ).rows
  for (const row of emailRows) {
    const outcome = await deliverEmail(row.id, fetchImpl)
    results[outcome === 'sent' ? 'sent' : outcome === 'failed' ? 'failed' : 'skipped'] += 1
  }
  return results
}

/* Email queue + delivery --------------------------------------------------- */

export interface QueueEmailInput {
  toEmail: string
  subject: string
  body: string
  html?: string
  relatedType?: string
  relatedId?: string
}

/** Record an outbound email before any delivery attempt. Never throws. */
export async function queueEmail(input: QueueEmailInput): Promise<string | null> {
  try {
    const row = await one<{ id: string }>(
      `insert into outbound_messages (channel, to_email, template, subject, body, html, related_type, related_id, status, provider)
       values ('email', $1, 'application.email_verification', $2, $3, $4, $5, $6, 'queued', 'resend') returning id`,
      [input.toEmail, input.subject, input.body, input.html ?? null, input.relatedType ?? null, input.relatedId ?? null],
    )
    return row?.id ?? null
  } catch {
    // Notification must never break the business workflow.
    return null
  }
}

async function deliverEmail(id: string, fetchImpl: FetchImpl): Promise<'sent' | 'failed' | 'skipped'> {
  const row = await one<{
    to_email: string
    subject: string
    body: string
    html: string | null
    attempts: number
  }>(
    "select to_email, subject, body, html, attempts from outbound_messages where id = $1 and channel = 'email' and status in ('queued', 'failed')",
    [id],
  )
  if (!row) return 'skipped'

  const config = notifyConfig()
  if (config.disabled || !config.email) {
    await query(`update outbound_messages set status = 'skipped', error = $2, attempts = attempts + 1 where id = $1`, [
      id,
      config.disabled
        ? 'Notifications are disabled (NOTIFY_DISABLED).'
        : 'No email provider is configured yet (RESEND_API_KEY + NOTIFY_EMAIL_FROM).',
    ])
    return 'skipped'
  }

  const request = buildResendRequest(config.email, row.to_email, row.subject, row.body, row.html ?? undefined)
  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })
    const payload = (await response.json().catch(() => ({}))) as never
    const parsed = parseResendResponse(payload)
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

/** Queue the verification email and attempt delivery in the background. Never throws. */
export async function queueAndDeliverEmail(input: QueueEmailInput & { html?: string }): Promise<void> {
  try {
    const config = notifyConfig()
    if (!config.email) {
      // Record the skipped attempt truthfully so Command can audit (and
      // manually resend) every verification mail once a provider is added.
      await query(
        `insert into outbound_messages (channel, to_email, template, subject, body, html, related_type, related_id, status, error)
         values ('email', $1, 'application.email_verification', $2, $3, $4, $5, $6, 'skipped', $7)`,
        [
          input.toEmail,
          input.subject,
          input.body,
          input.html ?? null,
          input.relatedType ?? null,
          input.relatedId ?? null,
          config.disabled
            ? 'Notifications are disabled (NOTIFY_DISABLED).'
            : 'No email provider is configured yet (RESEND_API_KEY + NOTIFY_EMAIL_FROM).',
        ],
      )
      return
    }
    const id = await queueEmail(input)
    if (!id) return
    void deliverEmail(id, globalThis.fetch as FetchImpl).catch(() => {})
  } catch {
    /* ignore */
  }
}
