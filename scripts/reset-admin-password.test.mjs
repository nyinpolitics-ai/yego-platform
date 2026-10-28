// Regression tests for the local/remote connection classification in
// scripts/reset-admin-password.mjs.
//
//   node --test scripts/reset-admin-password.test.mjs
//
// (Not picked up by vitest: vitest.config.ts only includes src/**/*.test.*)
//
// Background: the local/remote decision MUST be made on the parsed hostname
// only. An earlier implementation searched the whole connection string
// (/localhost|127\.0\.0\.1/.test(url)), so a password or query parameter
// containing the word "localhost" — or a lookalike host such as
// 127.0.0.1.evil.com — silently downgraded a REMOTE connection to plaintext.
// These tests pin the correct behaviour: only the exact hostnames
// "localhost" and "127.0.0.1" are local; everything else is remote and
// MUST use TLS with certificate verification (rejectUnauthorized: true).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveConnectionTarget } from './reset-admin-password.mjs'

const REMOTE_TLS = { rejectUnauthorized: true }

test('remote URL with "localhost" in the PASSWORD stays REMOTE', () => {
  const t = resolveConnectionTarget(
    'postgresql://admin:pw-localhost-pw@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require',
  )
  assert.equal(t.error, undefined)
  assert.equal(t.local, false)
  assert.deepEqual(t.ssl, REMOTE_TLS)
  assert.equal(new URL(t.connectionString).hostname, 'ep-x.eu-central-1.aws.neon.tech')
})

test('remote URL with "localhost" in the QUERY STRING stays REMOTE', () => {
  const t = resolveConnectionTarget(
    'postgresql://admin:pw@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require&hint=localhost&uselibpqcompat=true',
  )
  assert.equal(t.error, undefined)
  assert.equal(t.local, false)
  assert.deepEqual(t.ssl, REMOTE_TLS)
  const kept = new URL(t.connectionString)
  assert.equal(kept.hostname, 'ep-x.eu-central-1.aws.neon.tech')
  assert.equal(kept.searchParams.get('hint'), 'localhost') // non-ssl params survive untouched
  assert.equal(kept.searchParams.has('sslmode'), false) // ssl params are stripped
  assert.equal(kept.searchParams.has('uselibpqcompat'), false)
})

test('remote URL with "127.0.0.1" in the USERNAME stays REMOTE', () => {
  const t = resolveConnectionTarget('postgres://svc.127.0.0.1:pw@db.internal.example.com:5432/yego')
  assert.equal(t.local, false)
  assert.deepEqual(t.ssl, REMOTE_TLS)
  assert.equal(new URL(t.connectionString).hostname, 'db.internal.example.com')
})

test('lookalike host 127.0.0.1.evil.example is REMOTE (prefix match trap)', () => {
  const t = resolveConnectionTarget('postgres://admin:pw@127.0.0.1.evil.example/yego')
  assert.equal(t.local, false)
  assert.deepEqual(t.ssl, REMOTE_TLS)
})

test('host containing localhost as a substring is REMOTE', () => {
  const t = resolveConnectionTarget('postgres://admin:pw@not-localhost.example/yego')
  assert.equal(t.local, false)
  assert.deepEqual(t.ssl, REMOTE_TLS)
})

test('IPv6 loopback [::1] is REMOTE (strict whitelist)', () => {
  const t = resolveConnectionTarget('postgres://yego:pw@[::1]:5433/yego?sslmode=require')
  assert.equal(t.local, false)
  assert.deepEqual(t.ssl, REMOTE_TLS)
  // WHATWG URL keeps the brackets in .hostname for IPv6 hosts
  assert.equal(new URL(t.connectionString).hostname, '[::1]')
})

test('localhost is local (plaintext, no ssl options)', () => {
  const raw = 'postgres://yego:yego-dev-password@localhost:5433/yego'
  const t = resolveConnectionTarget(raw)
  assert.equal(t.error, undefined)
  assert.equal(t.local, true)
  assert.equal(t.ssl, undefined)
  assert.equal(t.connectionString, raw)
})

test('127.0.0.1 is local (plaintext, no ssl options)', () => {
  const raw = 'postgres://yego:yego-dev-password@127.0.0.1:5433/yego'
  const t = resolveConnectionTarget(raw)
  assert.equal(t.local, true)
  assert.equal(t.ssl, undefined)
  assert.equal(t.connectionString, raw)
})

test('LOCALHOST (uppercase) is still local (hostname is case-insensitive)', () => {
  const t = resolveConnectionTarget('postgres://yego:pw@LOCALHOST:5433/yego')
  assert.equal(t.local, true)
  assert.equal(t.ssl, undefined)
})

test('all ssl* / uselibpqcompat parameters are stripped from remote URLs', () => {
  const t = resolveConnectionTarget(
    'postgres://admin:pw@ep-x.eu-central-1.aws.neon.tech/neondb?ssl=true&sslfactory=evil.Factory&sslrootcert=/tmp/ca.pem&uselibpqcompat=true&application_name=yego',
  )
  assert.equal(t.local, false)
  const kept = new URL(t.connectionString)
  for (const key of [...kept.searchParams.keys()]) {
    assert.doesNotMatch(key, /^ssl/i)
    assert.notEqual(key, 'uselibpqcompat')
  }
  assert.equal(kept.searchParams.get('application_name'), 'yego') // unrelated params survive
})

test('remote URL without ssl parameters keeps its query string intact', () => {
  const raw = 'postgresql://admin:pw@ep-x.eu-central-1.aws.neon.tech/neondb'
  const t = resolveConnectionTarget(raw)
  assert.equal(t.local, false)
  assert.deepEqual(t.ssl, REMOTE_TLS)
  assert.equal(new URL(t.connectionString).pathname, '/neondb')
})

test('unparseable DATABASE_URL returns an error, never a classification', () => {
  const t = resolveConnectionTarget('not a url at all')
  assert.ok(t.error)
  assert.equal(t.local, undefined)
  assert.equal(t.ssl, undefined)
})
