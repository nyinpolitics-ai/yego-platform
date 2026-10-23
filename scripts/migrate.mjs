import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withClient } from './db.mjs'

const DIR = 'netlify/database/migrations'

export async function migrate(client) {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `)

  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort()
  const applied = new Map(
    (await client.query('select version, checksum from schema_migrations')).rows.map((r) => [r.version, r.checksum]),
  )

  for (const file of files) {
    const sql = await readFile(join(DIR, file), 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    const previous = applied.get(file)

    if (previous) {
      if (previous !== checksum) {
        throw new Error(`Migration ${file} was modified after being applied. Create a new migration instead.`)
      }
      console.log(`skip   ${file}`)
      continue
    }

    console.log(`apply  ${file}`)
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into schema_migrations (version, checksum) values ($1, $2)', [file, checksum])
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await withClient(async (client) => {
    await client.query('select pg_advisory_lock(824601)')
    try {
      await migrate(client)
    } finally {
      await client.query('select pg_advisory_unlock(824601)')
    }
  })
  console.log('migrations complete')
}
