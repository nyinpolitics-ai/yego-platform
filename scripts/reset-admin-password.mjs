#!/usr/bin/env node
// Reset ONE YEGO Super Administrator password directly in the database.
//
// Scope guard: ONLY the password_hash of the single account named by
// ADMIN_EMAIL is written. Role, name, scope, kind, active status and every
// other column are left untouched, and the script refuses to run against a
// missing, deactivated or ambiguous account. All active sessions of that one
// account are invalidated so the reset takes effect immediately.
//
// Usage (Windows PowerShell):
//   $env:DATABASE_URL       = "postgresql://..."   # never share this with anyone
//   $env:ADMIN_EMAIL        = "owner@yego.ng"
//   $env:NEW_ADMIN_PASSWORD = "..."                # or leave unset to be prompted
//   node reset-admin-password.mjs
//   # the script shows the account, then asks you to type RESET to proceed
//
// Requirements: Node.js 18+ and the `pg` package (`npm install pg`).
//
// Security notes:
// - NOTHING is written until you explicitly confirm: the script shows the
//   target account (email, name, role, scope, active status) and continues
//   only if you type RESET. Anything else — or Ctrl+C / EOF — closes the
//   connection without changing anything.
// - The password is hashed with the exact scheme the application uses
//   (src/server/security.server.ts): scrypt N=16384 r=8 p=1 keylen=64,
//   16-byte random salt, base64url segments:
//   scrypt$16384$8$1$<salt>$<hash>
// - The update runs inside a transaction: the new hash is read back and
//   verified BEFORE commit, sessions are cleared in the same transaction,
//   and any failure rolls everything back. After commit the row is read
//   again and the untouched columns are compared against their pre-reset
//   values.
// - Remote connections always use TLS with full server-certificate
//   verification (CA chain + hostname). ssl-related parameters inside
//   DATABASE_URL are stripped so this policy cannot be downgraded from
//   the connection string; there is no rejectUnauthorized: false and no
//   plaintext fallback for remote hosts. Only local dev databases
//   (127.0.0.1 / localhost) connect without TLS.
// - The password, the connection string and the hash are never printed.
//   Error output is scrubbed of secrets before display.

import { Buffer } from 'node:buffer'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { createInterface } from 'node:readline'

import pg from 'pg'

/* ------------------------------------------------------------------ */
/* Hashing — must stay byte-identical to src/server/security.server.ts */
/* ------------------------------------------------------------------ */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT.keylen, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

function verifyPassword(password, stored) {
  const [algo, n, r, p, saltB64, hashB64] = String(stored).split('$')
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false
  const salt = Buffer.from(saltB64, 'base64url')
  const expected = Buffer.from(hashB64, 'base64url')
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/* ------------------------------------------------------------------ */
/* Secret hygiene                                                      */
/* ------------------------------------------------------------------ */

/** Remove every secret from a message before it may reach the console. */
function scrub(message) {
  let text = String(message ?? '')
  const url = process.env.DATABASE_URL
  const password = process.env.NEW_ADMIN_PASSWORD
  if (url) text = text.split(url).join('[redacted-database-url]')
  if (password) text = text.split(password).join('[redacted-password]')
  // Defence in depth: any remaining scheme://... string (e.g. a URL an
  // error message picked up from the driver) is redacted as well.
  return text.replace(/[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s'"]+/g, '[redacted-url]')
}

function fail(message, error) {
  console.error(`ABORTED: ${scrub(message)}`)
  if (error) console.error(`DETAIL: ${scrub(error instanceof Error ? error.message : error)}`)
  process.exit(1)
}

/** Reads a line without echoing it, so the password never lands in shell
 * history or process listings (same pattern as scripts/create-admin.mjs). */
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (text) => {
      if (!text.includes(question)) return // keep the answer off-screen
      process.stdout.write(text)
    }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

async function readPassword() {
  const first = await promptHidden('New Super Administrator password: ')
  const second = await promptHidden('Repeat the password: ')
  if (first !== second) fail('The two password entries do not match.')
  return first
}

class Aborted extends Error {}

/** Reads one line with echo ON (the answer is not a secret). Resolves null
 * on EOF / Ctrl+D / closed stdin, so every caller can treat "no answer" as
 * an abort. Ctrl+C is turned into a graceful close instead of a hard kill. */
function askLine(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    rl.on('SIGINT', () => rl.close())
    rl.question(question, (answer) => {
      done(answer) // settle FIRST — rl.close() can emit 'close' synchronously
      rl.close()   // (when stdin already ended), which must not overwrite the answer
    })
    rl.on('close', () => done(null))
  })
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

const url = process.env.DATABASE_URL
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  fail('Set DATABASE_URL to a postgres connection string. It is used only to connect and is never printed.')
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
if (!email) {
  fail('Set ADMIN_EMAIL to the exact email address of the ONE Super Administrator account to reset.')
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail('ADMIN_EMAIL is not a valid email address.')
}

const password = process.env.NEW_ADMIN_PASSWORD ?? (process.stdin.isTTY ? await readPassword() : undefined)
if (!password) {
  fail('Set NEW_ADMIN_PASSWORD, or run in an interactive terminal to be prompted for it.')
}
if (password.length < 10 || password.length > 200) {
  fail('The new password must be between 10 and 200 characters.')
}

/* ------------------------------------------------------------------ */
/* Connect — TLS with server-certificate verification                  */
/* ------------------------------------------------------------------ */

// TLS policy:
//  - Remote databases (e.g. Neon): TLS is always on and the server
//    certificate is ALWAYS verified (CA chain AND hostname). A failed
//    verification aborts the script — no insecure fallback exists.
//  - Local dev databases (127.0.0.1 / localhost): they do not terminate
//    TLS, so they connect in plaintext.
const local = /localhost|127\.0\.0\.1/.test(url)

let connectionString = url
if (!local) {
  try {
    const parsed = new URL(url)
    // node-postgres lets ssl-related connection-string parameters
    // (sslmode, sslfactory, sslrootcert, uselibpqcompat, ...) override the
    // explicit ssl options below. Strip every one of them so the verified-
    // TLS policy cannot be downgraded from inside DATABASE_URL.
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^ssl/i.test(key) || key === 'uselibpqcompat') parsed.searchParams.delete(key)
    }
    connectionString = parsed.toString()
  } catch {
    fail('DATABASE_URL is not a valid URL. It is used only to connect and is never printed.')
  }
}

const client = new pg.Client({
  connectionString,
  ssl: local ? undefined : { rejectUnauthorized: true },
})

try {
  await client.connect()
} catch (error) {
  fail('Could not connect to the database. Check DATABASE_URL (the value is never printed).', error)
}

try {
  /* ---------------------------------------------------------------- */
  /* Locate exactly one eligible Super Administrator                   */
  /* ---------------------------------------------------------------- */

  const COLUMNS = 'id, email, name, role, kind, scope_kind, scope_zone, scope_state, scope_lga, active'
  const found = (
    await client.query(
      `select ${COLUMNS} from users
       where role = 'Super Administrator' and lower(email) = $1`,
      [email],
    )
  ).rows

  if (found.length === 0) {
    const other = (await client.query('select role, active from users where lower(email) = $1', [email])).rows[0]
    if (other) {
      fail(
        `Account ${email} exists but has role "${other.role}". This script only resets Super Administrator accounts; use Command Centre → Roles & access for other roles.`,
      )
    }
    fail(`No account exists with email ${email}. Check the address and try again.`)
  }
  if (found.length > 1) {
    fail(`${found.length} Super Administrator accounts match ${email}; refusing to choose between them.`)
  }

  const target = found[0]
  if (!target.active) {
    fail(
      `Account ${email} is deactivated. Reactivate it first (another Super Administrator: Command Centre → Roles & access), then run this script again.`,
    )
  }

  console.log('')
  console.log(`Target account : ${target.email}`)
  console.log(`Name           : ${target.name}`)
  console.log(`Role           : ${target.role}`)
  console.log(`Scope          : ${target.scope_kind}`)
  console.log(`Status         : ${target.active ? 'active' : 'deactivated'}`)
  console.log('')
  console.log("This changes ONLY this account's password and invalidates all of its")
  console.log('existing sessions. Role, name, scope and active status stay untouched.')

  /* ---------------------------------------------------------------- */
  /* Explicit confirmation gate — nothing is written without RESET      */
  /* ---------------------------------------------------------------- */

  const answer = await askLine('Type RESET to continue, or anything else to abort: ')
  if (answer?.trim() !== 'RESET') {
    throw new Aborted('Confirmation was not "RESET". The connection has been closed and nothing was changed.')
  }

  /* ---------------------------------------------------------------- */
  /* Transactional reset                                               */
  /* ---------------------------------------------------------------- */

  const newHash = hashPassword(password)
  if (!verifyPassword(password, newHash)) {
    fail('Self-check of the generated hash failed — nothing was written to the database.')
  }

  let sessionsCleared = 0
  await client.query('begin')
  try {
    const update = await client.query(
      'update users set password_hash = $1 where id = $2',
      [newHash, target.id],
    )
    if (update.rowCount !== 1) throw new Error('password update did not change exactly one row')

    const readBack = (await client.query('select password_hash from users where id = $1', [target.id])).rows[0]
    if (!verifyPassword(password, readBack.password_hash)) {
      throw new Error('read-back verification of the new hash failed inside the transaction')
    }

    const cleared = await client.query('delete from sessions where user_id = $1', [target.id])
    sessionsCleared = cleared.rowCount ?? 0

    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    fail('Database update failed — the transaction was rolled back and nothing was changed.', error)
  }

  /* ---------------------------------------------------------------- */
  /* Post-commit verification                                          */
  /* ---------------------------------------------------------------- */

  const after = (
    await client.query(`select ${COLUMNS}, password_hash from users where id = $1`, [target.id])
  ).rows[0]

  if (!verifyPassword(password, after.password_hash)) {
    fail('Post-commit verification failed: the stored hash does not match the new password.')
  }
  const untouched = ['email', 'name', 'role', 'kind', 'scope_kind', 'scope_zone', 'scope_state', 'scope_lga', 'active']
  const changed = untouched.filter((column) => String(after[column]) !== String(target[column]))
  if (changed.length > 0) {
    fail(`Post-commit check found unexpected changes to: ${changed.join(', ')}.`)
  }

  console.log('Committed      : password_hash updated (exactly 1 row)')
  console.log(`Sessions       : ${sessionsCleared} active session(s) invalidated — re-login is required`)
  console.log('Verified       : stored hash matches the new password; role, name, scope and active status unchanged')
  console.log(`Done. ${target.email} can now sign in at yego.ng/login (Command tab) with the new password.`)
} catch (error) {
  if (error instanceof Aborted) {
    console.error(`ABORTED: ${scrub(error.message)}`)
    process.exitCode = 1
  } else {
    fail('Unexpected database error — the script stopped; nothing beyond the reported state was changed.', error)
  }
} finally {
  await client.end().catch(() => {})
}
