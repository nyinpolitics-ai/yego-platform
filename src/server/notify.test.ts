// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  buildMetaWhatsAppRequest,
  buildTwilioRequest,
  notifyConfig,
  parseMetaWhatsAppResponse,
  parseTwilioResponse,
  renderTemplate,
  resolveChannel,
  toE164,
  type NotifyConfig,
} from './notify.server'

const TWILIO_CONFIG: NonNullable<NotifyConfig['twilio']> = {
  accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  authToken: 'authtoken',
  from: '+2349000000001',
  messagingServiceSid: null,
}

const META_CONFIG: NonNullable<NotifyConfig['meta']> = {
  token: 'meta-token',
  phoneNumberId: '1234567890',
}

describe('toE164', () => {
  it('converts local Nigerian numbers to E.164', () => {
    expect(toE164('08031250405')).toBe('+2348031250405')
  })

  it('accepts international input', () => {
    expect(toE164('+234 803 125 0405')).toBe('+2348031250405')
    expect(toE164('2348031250405')).toBe('+2348031250405')
  })
})

describe('resolveChannel', () => {
  it('prefers whatsapp under auto preference', () => {
    const config: NotifyConfig = {
      twilio: TWILIO_CONFIG,
      meta: META_CONFIG,
      preference: 'auto',
      disabled: false,
    }
    expect(resolveChannel(config)).toBe('whatsapp')
  })

  it('falls back to sms when only twilio is configured', () => {
    const config: NotifyConfig = {
      twilio: TWILIO_CONFIG,
      meta: null,
      preference: 'auto',
      disabled: false,
    }
    expect(resolveChannel(config)).toBe('sms')
  })

  it('returns null when nothing is configured or disabled', () => {
    expect(
      resolveChannel({
        twilio: null,
        meta: null,
        preference: 'auto',
        disabled: false,
      }),
    ).toBeNull()
    expect(
      resolveChannel({
        twilio: TWILIO_CONFIG,
        meta: META_CONFIG,
        preference: 'auto',
        disabled: true,
      }),
    ).toBeNull()
  })

  it('honours an explicit preference even when the other provider exists', () => {
    const config: NotifyConfig = {
      twilio: TWILIO_CONFIG,
      meta: META_CONFIG,
      preference: 'sms',
      disabled: false,
    }
    expect(resolveChannel(config)).toBe('sms')
    expect(resolveChannel({ ...config, preference: 'whatsapp' })).toBe('whatsapp')
    expect(resolveChannel({ ...config, meta: null, preference: 'whatsapp' })).toBeNull()
  })
})

describe('notifyConfig', () => {
  it('detects a complete twilio configuration', () => {
    const config = notifyConfig({
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'tok',
      TWILIO_FROM_NUMBER: '+2349000000001',
    } as NodeJS.ProcessEnv)
    expect(config.twilio?.accountSid).toBe('AC123')
    expect(config.meta).toBeNull()
  })

  it('requires a sender or messaging service for twilio', () => {
    const config = notifyConfig({
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'tok',
    } as NodeJS.ProcessEnv)
    expect(config.twilio).toBeNull()
  })

  it('detects meta whatsapp configuration', () => {
    const config = notifyConfig({
      META_WHATSAPP_TOKEN: 't',
      META_WHATSAPP_PHONE_NUMBER_ID: '1',
    } as NodeJS.ProcessEnv)
    expect(config.meta?.phoneNumberId).toBe('1')
  })

  it('marks NOTIFY_DISABLED=1 as disabled', () => {
    const config = notifyConfig({
      NOTIFY_DISABLED: '1',
      META_WHATSAPP_TOKEN: 't',
      META_WHATSAPP_PHONE_NUMBER_ID: '1',
    } as NodeJS.ProcessEnv)
    expect(config.disabled).toBe(true)
  })
})

describe('provider request builders', () => {
  it('builds a Twilio form request with basic auth', () => {
    const request = buildTwilioRequest(TWILIO_CONFIG, '+2348031250405', 'YEGO: test message')
    expect(request.url).toContain(
      'https://api.twilio.com/2010-04-01/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Messages.json',
    )
    expect(request.headers.Authorization).toMatch(/^Basic /)
    expect(request.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(request.body).toContain('To=%2B2348031250405')
    expect(request.body).toContain('From=%2B2349000000001')
    expect(request.body).toContain('Body=YEGO%3A+test+message')
  })

  it('prefers the messaging service when present', () => {
    const request = buildTwilioRequest(
      { ...TWILIO_CONFIG, from: null, messagingServiceSid: 'MG123' },
      '+2348031250405',
      'body',
    )
    expect(request.body).toContain('MessagingServiceSid=MG123')
    expect(request.body).not.toContain('From=')
  })

  it('builds a Meta WhatsApp JSON request with bearer auth', () => {
    const request = buildMetaWhatsAppRequest(META_CONFIG, '+2348031250405', 'YEGO: test message')
    expect(request.url).toBe('https://graph.facebook.com/v21.0/1234567890/messages')
    expect(request.headers.Authorization).toBe('Bearer meta-token')
    const payload = JSON.parse(request.body) as {
      messaging_product: string
      to: string
      text: { body: string }
    }
    expect(payload.messaging_product).toBe('whatsapp')
    expect(payload.to).toBe('+2348031250405')
    expect(payload.text.body).toBe('YEGO: test message')
  })

  it('parses provider success and failure payloads', () => {
    expect(parseTwilioResponse({ sid: 'SM123' })).toEqual({
      id: 'SM123',
      error: null,
    })
    expect(parseTwilioResponse({ message: 'Invalid parameter' }).error).toBe('Invalid parameter')
    expect(parseMetaWhatsAppResponse({ messages: [{ id: 'wamid.X' }] })).toEqual({ id: 'wamid.X', error: null })
    expect(parseMetaWhatsAppResponse({ error: { message: 'bad token' } }).error).toBe('bad token')
  })
})

describe('renderTemplate', () => {
  it('renders the application received template', () => {
    const body = renderTemplate('application.received', {
      applicationId: 'YG-APP-240001',
    })
    expect(body).toContain('YG-APP-240001')
  })

  it('renders a status change with an optional note', () => {
    expect(
      renderTemplate('application.status', {
        applicationId: 'YG-APP-240001',
        status: 'Certified/Active',
      }),
    ).toContain('is now "Certified/Active"')
    expect(
      renderTemplate('application.status', {
        applicationId: 'YG-APP-1',
        status: 'Approved',
        note: 'Bring your PVC',
      }),
    ).toContain('Note: Bring your PVC')
  })

  it('renders applicant messages with an optional title', () => {
    expect(
      renderTemplate('applicant.message', {
        title: 'Screening',
        body: 'Come Thursday',
      }),
    ).toBe('YEGO message — Screening: Come Thursday')
    expect(renderTemplate('applicant.message', { body: 'Come Thursday' })).toBe('YEGO message: Come Thursday')
  })
})
