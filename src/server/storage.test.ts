// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'

import {
  EVIDENCE_CHUNK_SIZE,
  EVIDENCE_MIME_WHITELIST,
  EVIDENCE_SIZE_CAPS,
  buildEvidenceKey,
  evidenceStorageDriver,
  isValidEvidenceKey,
  signEvidenceTicket,
  signEvidenceViewToken,
  verifyEvidenceTicket,
  verifyEvidenceViewToken,
} from './storage.server'
import { evidenceChunkInput, evidenceInput, evidenceUploadInput } from './validation.server'
import { parse } from './validation.server'

const ENV_KEYS = ['SESSION_SECRET', 'EVIDENCE_STORAGE', 'EVIDENCE_STORAGE_ROOT', 'BLOB_READ_WRITE_TOKEN', 'NETLIFY_BLOBS_CONTEXT'] as const

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.SESSION_SECRET = 'test-secret-for-evidence-unit-tests'
  process.env.NODE_ENV = 'test'
})

describe('evidence keys', () => {
  it('generates keys inside the evidence/ namespace with the right extension', () => {
    const { key } = buildEvidenceKey('image/jpeg')
    expect(key.startsWith('evidence/')).toBe(true)
    expect(key.endsWith('.jpg')).toBe(true)
    expect(isValidEvidenceKey(key)).toBe(true)
    expect(isValidEvidenceKey(buildEvidenceKey('video/mp4').key)).toBe(true)
    expect(isValidEvidenceKey(buildEvidenceKey('application/pdf').key)).toBe(true)
  })

  it('rejects paths that escape the namespace or contain traversal', () => {
    expect(isValidEvidenceKey('evidence/../../etc/passwd')).toBe(false)
    expect(isValidEvidenceKey('someone-elses-key.jpg')).toBe(false)
    expect(isValidEvidenceKey('evidence/2026/01/not-a-uuid.jpg')).toBe(false)
    expect(isValidEvidenceKey('evidence/2026/01/8f1fd6ae-1111-2222-3333-444455556666.exe')).toBe(false)
  })
})

describe('evidence upload tickets', () => {
  const key = buildEvidenceKey('image/jpeg').key
  const exp = Math.floor(Date.now() / 1000) + 600

  it('accepts a correctly signed ticket', () => {
    const ticket = signEvidenceTicket(key, 'image/jpeg', 12345, exp)
    expect(verifyEvidenceTicket(key, 'image/jpeg', 12345, exp, ticket)).toBe(true)
  })

  it('rejects a ticket reused for a different key, mime or size', () => {
    const ticket = signEvidenceTicket(key, 'image/jpeg', 12345, exp)
    expect(verifyEvidenceTicket(buildEvidenceKey('image/jpeg').key, 'image/jpeg', 12345, exp, ticket)).toBe(false)
    expect(verifyEvidenceTicket(key, 'image/png', 12345, exp, ticket)).toBe(false)
    expect(verifyEvidenceTicket(key, 'image/jpeg', 99999, exp, ticket)).toBe(false)
    expect(verifyEvidenceTicket(key, 'image/jpeg', 12345, exp + 1, ticket)).toBe(false)
  })

  it('rejects expired and forged tickets', () => {
    const past = Math.floor(Date.now() / 1000) - 10
    const ticket = signEvidenceTicket(key, 'image/jpeg', 1, past)
    expect(verifyEvidenceTicket(key, 'image/jpeg', 1, past, ticket)).toBe(false)
    expect(verifyEvidenceTicket(key, 'image/jpeg', 1, exp, 'forged-signature-value')).toBe(false)
  })

  it('binds view tokens to a specific evidence id and expiry', () => {
    const exp = Math.floor(Date.now() / 1000) + 60
    const sig = signEvidenceViewToken('uuid-1', exp)
    expect(verifyEvidenceViewToken('uuid-1', exp, sig)).toBe(true)
    expect(verifyEvidenceViewToken('uuid-2', exp, sig)).toBe(false)
    expect(verifyEvidenceViewToken('uuid-1', exp + 1, sig)).toBe(false)
    const past = Math.floor(Date.now() / 1000) - 5
    expect(verifyEvidenceViewToken('uuid-1', past, signEvidenceViewToken('uuid-1', past))).toBe(false)
  })
})

describe('evidence storage driver selection', () => {
  it('auto-selects netlify-blobs inside Netlify and disk elsewhere', () => {
    delete process.env.EVIDENCE_STORAGE
    expect(evidenceStorageDriver()).toBe('disk')
    process.env.BLOB_READ_WRITE_TOKEN = 'token'
    expect(evidenceStorageDriver()).toBe('netlify-blobs')
    delete process.env.BLOB_READ_WRITE_TOKEN
    process.env.EVIDENCE_STORAGE = 'off'
    expect(evidenceStorageDriver()).toBe('off')
    process.env.EVIDENCE_STORAGE = 'disk'
    expect(evidenceStorageDriver()).toBe('disk')
  })
})

describe('evidence validation schemas', () => {
  it('accepts a valid upload slot request', () => {
    const parsed = parse(evidenceUploadInput, {
      fileName: 'scene.jpg',
      mimeType: 'image/jpeg',
      byteSize: 2 * 1024 * 1024,
    })
    expect(parsed.byteSize).toBe(2 * 1024 * 1024)
  })

  it('rejects unsupported file types and oversized files', () => {
    expect(() => parse(evidenceUploadInput, { fileName: 'a.gif', mimeType: 'image/gif', byteSize: 10 })).toThrow()
    expect(() =>
      parse(evidenceUploadInput, { fileName: 'big.mp4', mimeType: 'video/mp4', byteSize: EVIDENCE_SIZE_CAPS.video + 1 }),
    ).toThrow()
    expect(() =>
      parse(evidenceUploadInput, { fileName: 'big.jpg', mimeType: 'image/jpeg', byteSize: EVIDENCE_SIZE_CAPS.photo + 1 }),
    ).toThrow()
  })

  it('keeps the kind consistent with the mime type and the size caps', () => {
    const base = {
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      byteSize: 1024,
      storageKey: buildEvidenceKey('video/mp4').key,
      ticket: 'x'.repeat(40),
      exp: Math.floor(Date.now() / 1000) + 600,
      parts: 1,
    }
    expect(parse(evidenceInput, { ...base, kind: 'video' }).kind).toBe('video')
    expect(() => parse(evidenceInput, { ...base, kind: 'photo' })).toThrow()
    expect(() => parse(evidenceInput, { ...base, kind: 'video', byteSize: EVIDENCE_SIZE_CAPS.video + 1 })).toThrow()
  })

  it('bounds each chunk to the configured chunk size', () => {
    const base = {
      storageKey: buildEvidenceKey('image/png').key,
      ticket: 'x'.repeat(40),
      mimeType: 'image/png',
      byteSize: 4096,
      exp: Math.floor(Date.now() / 1000) + 600,
      partIndex: 0,
    }
    expect(parse(evidenceChunkInput, { ...base, data: 'aGVsbG8=' }).partIndex).toBe(0)
    expect(() => parse(evidenceChunkInput, { ...base, data: 'x'.repeat(EVIDENCE_CHUNK_SIZE * 3) })).toThrow()
    expect(() => parse(evidenceChunkInput, { ...base, data: 'aGVsbG8=', partIndex: 5000 })).toThrow()
  })

  it('maps every whitelisted mime type to an evidence kind', () => {
    for (const [mime, kind] of Object.entries(EVIDENCE_MIME_WHITELIST)) {
      expect(['photo', 'video', 'document']).toContain(kind)
      expect(mime).toBeTruthy()
    }
  })
})
