import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

declare global {
  var __yegoPool: pg.Pool | undefined
}

function connectionString(): string {
  const fromEnv = process.env.DATABASE_URL
  if (fromEnv) return fromEnv

  throw new Error(
    'Database is not configured. Set DATABASE_URL on the server (e.g. Supabase connection string). See docs/SUPABASE_SETUP.md.',
  )
}

export function getDatabaseSslConfig(): pg.PoolConfig['ssl'] {
  const url = connectionString()
  const local = /localhost|127\.0\.0\.1/.test(url)
  if (local) return undefined

  // 1. Direct CA certificate from environment variable (e.g. Render / PaaS env)
  const caFromEnv = process.env.DATABASE_CA_CERT
  if (caFromEnv) {
    return {
      rejectUnauthorized: true,
      ca: caFromEnv,
    }
  }

  // 2. CA certificate file path from environment variable or standard location
  const candidatePaths = [
    process.env.DATABASE_CA_CERT_PATH,
    join(process.cwd(), 'certs', 'supabase-ca.crt'),
    join(process.cwd(), 'certs', 'prod-ca-2021.crt'),
  ].filter((p): p is string => Boolean(p && existsSync(p)))

  if (candidatePaths.length > 0) {
    return {
      rejectUnauthorized: true,
      ca: readFileSync(candidatePaths[0], 'utf8'),
    }
  }

  // 3. Fallback when no custom CA is provided
  const strict = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true'
  if (!strict && process.env.NODE_ENV === 'production') {
    console.warn(
      '[yego-db] Notice: PostgreSQL TLS active without custom CA certificate. ' +
      'To enforce strict certificate verification, set DATABASE_CA_CERT or DATABASE_CA_CERT_PATH (see docs/SUPABASE_SETUP.md).',
    )
  }

  return {
    rejectUnauthorized: strict,
  }
}

function createPool(): pg.Pool {
  const url = connectionString()
  const maxConnections = Number(process.env.DB_MAX_CONNECTIONS || (process.env.NODE_ENV === 'production' ? 10 : 5))

  const poolInstance = new pg.Pool({
    connectionString: url,
    max: maxConnections,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: getDatabaseSslConfig(),
  })

  // Prevent unexpected idle client errors from terminating the Node process
  poolInstance.on('error', (err) => {
    console.error('[yego-db] Unexpected idle PostgreSQL client error:', err.message)
  })

  return poolInstance
}

export function pool(): pg.Pool {
  globalThis.__yegoPool ??= createPool()
  return globalThis.__yegoPool
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool().query<T>(text, params)
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const result = await query<T>(text, params)
  return result.rows[0] ?? null
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect()
  try {
    await client.query('begin')
    const value = await fn(client)
    await client.query('commit')
    return value
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
      // connection already failed
    }
    throw error
  } finally {
    client.release()
  }
}

export function isDatabaseConfigured(): boolean {
  try {
    connectionString()
    return true
  } catch {
    return false
  }
}
