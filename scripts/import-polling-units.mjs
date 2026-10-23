import { createReadStream, existsSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { loadEnv, withClient } from './db.mjs'
import { STATES } from '../src/lib/nigeria.ts'

loadEnv()

const STATE_NUM_TO_CODE = {
  '01': 'AB', '02': 'AD', '03': 'AK', '04': 'AN', '05': 'BA', '06': 'BY', '07': 'BE', '08': 'BO',
  '09': 'CR', '10': 'DE', '11': 'EB', '12': 'ED', '13': 'EK', '14': 'EN', '15': 'GO', '16': 'IM',
  '17': 'JI', '18': 'KD', '19': 'KN', '20': 'KT', '21': 'KB', '22': 'KO', '23': 'KW', '24': 'LA',
  '25': 'NA', '26': 'NI', '27': 'OG', '28': 'ON', '29': 'OS', '30': 'OY', '31': 'PL', '32': 'RI',
  '33': 'SO', '34': 'TA', '35': 'YO', '36': 'ZA', '37': 'FC'
}

const STATE_NAME_TO_CODE = Object.fromEntries(
  STATES.map((state) => [state.name.toUpperCase().trim(), state.code]),
)
STATE_NAME_TO_CODE['FCT'] = 'FC'
STATE_NAME_TO_CODE['FEDERAL CAPITAL TERRITORY'] = 'FC'
STATE_NAME_TO_CODE['NASSARAWA'] = 'NA'

// Stream CSV with stateful RFC 4180 quote/newline handling
async function* parseCsvStream(stream) {
  let inQuotes = false
  let currentFields = []
  let currentField = ''

  for await (const chunk of stream) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i]

      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          currentField += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        currentFields.push(currentField.trim())
        currentField = ''
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && text[i + 1] === '\n') i += 1
        currentFields.push(currentField.trim())
        currentField = ''
        if (currentFields.length > 1 || (currentFields.length === 1 && currentFields[0] !== '')) {
          yield currentFields
        }
        currentFields = []
      } else {
        currentField += char
      }
    }
  }

  if (currentField || currentFields.length > 0) {
    currentFields.push(currentField.trim())
    yield currentFields
  }
}

export async function runImport({ source, dryRun = false } = {}) {
  const isUrl = /^https?:\/\//i.test(source)
  let nodeStream

  if (isUrl) {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`Could not fetch dataset: ${response.status} ${response.statusText}`)
    if (!response.body) throw new Error('Download returned empty body')
    nodeStream = Readable.fromWeb(response.body)
  } else {
    if (!existsSync(source)) throw new Error(`Source file not found at: ${source}`)
    nodeStream = createReadStream(source)
  }

  const parser = parseCsvStream(nodeStream)
  let headerFields = null
  let totalRows = 0
  let validRecords = 0
  let skipped = 0
  const uniqueCodes = new Set()
  const stateCounts = new Map()
  const lgaSet = new Set()
  const wardSet = new Set()
  let batch = []
  let insertedOrUpdated = 0

  console.log(`\n================ POLLING UNIT IMPORTER ================`)
  console.log(`Source: ${source}`)
  console.log(`Mode: ${dryRun ? 'DRY-RUN (Validation only - no DB writes)' : 'LIVE IMPORT (Writing to Supabase)'}`)

  async function flush(client) {
    if (!batch.length || dryRun) {
      batch = []
      return
    }
    const values = []
    const params = []
    let index = 1
    for (const row of batch) {
      values.push(`($${index},$${index + 1},$${index + 2},$${index + 3},$${index + 4},$${index + 5},$${index + 6})`)
      params.push(...row)
      index += 7
    }
    const result = await client.query(
      `insert into polling_units (state_code, lga, ward, code, name, source, verified)
       values ${values.join(',')}
       on conflict (code) do update set
         state_code = excluded.state_code,
         lga = excluded.lga,
         ward = excluded.ward,
         name = excluded.name,
         source = case when polling_units.lat is not null then polling_units.source else excluded.source end`,
      params,
    )
    insertedOrUpdated += result.rowCount ?? 0
    batch = []
  }

  const execute = async (client) => {
    for await (const row of parser) {
      if (!headerFields) {
        headerFields = row.map((f) => f.toLowerCase())
        continue
      }
      totalRows += 1

      let stateCode
      let lga
      let ward
      let code
      let name

      if (headerFields.includes('full_code')) {
        // Candidate A (saidiadegoke/nigeria-inec-geo)
        const rawStateCode = row[0]
        const rawStateName = row[1]
        stateCode = STATE_NUM_TO_CODE[rawStateCode] || STATE_NAME_TO_CODE[rawStateName?.toUpperCase()?.trim()]
        lga = row[3]?.trim()
        ward = row[5]?.trim()
        name = row[7]?.trim() || row[8]?.trim() || 'Unnamed Polling Unit'
        code = row[9]?.trim()
      } else {
        // Candidate B (Emeka-Onwuepe/Polling_Units_in_Nigeria)
        const rawStateName = row[1]
        const rawStateCode = row[4]
        stateCode = STATE_NUM_TO_CODE[rawStateCode] || STATE_NAME_TO_CODE[rawStateName?.toUpperCase()?.trim()]
        lga = row[2]?.trim()
        ward = row[3]?.trim()
        code = row[8]?.trim()
        name = row[9]?.trim() || 'Unnamed Polling Unit'
      }

      const isValidCode = Boolean(code && /^\d{2}\/\d{2}\/\d{2}\/\d{3}$/.test(code))
      const isValidState = Boolean(stateCode && stateCode.length === 2 && STATE_NAME_TO_CODE[Object.keys(STATE_NAME_TO_CODE).find(k => STATE_NAME_TO_CODE[k] === stateCode)])
      const isValidLga = Boolean(lga && lga.length > 0)
      const isValidWard = Boolean(ward && ward.length > 0)
      const isValidName = Boolean(name && name.length > 0)

      if (isValidCode && isValidState && isValidLga && isValidWard && isValidName) {
        validRecords += 1
        uniqueCodes.add(code)
        stateCounts.set(stateCode, (stateCounts.get(stateCode) || 0) + 1)
        lgaSet.add(`${stateCode}__${lga.toUpperCase()}`)
        wardSet.add(`${stateCode}__${lga.toUpperCase()}__${ward.toUpperCase()}`)

        if (!dryRun) {
          batch.push([stateCode, lga, ward, code, name, 'inec-dataset', false])
          if (batch.length >= 500) {
            await flush(client)
            if (insertedOrUpdated % 10000 === 0 && insertedOrUpdated > 0) {
              console.log(`Processed ${insertedOrUpdated} records...`)
            }
          }
        }
      } else {
        skipped += 1
      }
    }

    if (!dryRun) {
      await flush(client)
    }

    console.log(`\n--- IMPORT SUMMARY ---`)
    console.log(`Total CSV Rows: ${totalRows}`)
    console.log(`Valid Records: ${validRecords}`)
    console.log(`Unique Polling Units: ${uniqueCodes.size}`)
    console.log(`Skipped / Malformed Records: ${skipped}`)
    console.log(`States Covered: ${stateCounts.size} / 37`)
    console.log(`LGAs Covered: ${lgaSet.size} / 774`)
    console.log(`Wards Covered: ${wardSet.size}`)
    if (dryRun) {
      console.log(`Status: DRY-RUN SUCCESSFUL. (0 rows modified in database).`)
    } else {
      console.log(`Status: LIVE IMPORT COMPLETED. Processed ${insertedOrUpdated} database records.`)
    }

    return {
      totalRows,
      validRecords,
      uniqueCodes: uniqueCodes.size,
      skipped,
      statesCount: stateCounts.size,
      lgasCount: lgaSet.size,
      wardsCount: wardSet.size,
      dryRun,
    }
  }

  if (dryRun) {
    return await execute(null)
  } else {
    return await withClient(execute)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const defaultSource = 'https://raw.githubusercontent.com/saidiadegoke/nigeria-inec-geo/main/data/polling-units.csv'
  const sourceArg = args.find((a) => !a.startsWith('--')) ?? defaultSource

  await runImport({ source: sourceArg, dryRun })
}
