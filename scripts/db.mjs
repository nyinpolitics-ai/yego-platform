import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

export function loadEnv() {
  try {
    if (existsSync('.env')) process.loadEnvFile('.env')
  } catch {
    // .env is optional
  }
}

export function connectionString() {
  loadEnv()
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  throw new Error(
    'No database configured. Set DATABASE_URL (see .env.example).',
  )
}

export function sslConfig() {
  const url = connectionString()
  const local = /localhost|127\.0\.0\.1/.test(url)
  if (local) return undefined

  const caFromEnv = process.env.DATABASE_CA_CERT
  if (caFromEnv) {
    return {
      rejectUnauthorized: true,
      ca: caFromEnv,
    }
  }

  const candidatePaths = [
    process.env.DATABASE_CA_CERT_PATH,
    join(process.cwd(), 'certs', 'supabase-ca.crt'),
    join(process.cwd(), 'certs', 'prod-ca-2021.crt'),
  ].filter((p) => p && existsSync(p))

  if (candidatePaths.length > 0) {
    return {
      rejectUnauthorized: true,
      ca: readFileSync(candidatePaths[0], 'utf8'),
    }
  }

  const strict = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true'
  return {
    rejectUnauthorized: strict,
  }
}

export function client() {
  const url = connectionString()
  return new pg.Client({
    connectionString: url,
    ssl: sslConfig(),
  })
}

export async function withClient(fn) {
  const c = client()
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}
