// Smoke screenshots of the polished public pages (production build via server.mjs).
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'
const OUT_DIR = new URL('../../download/polish2/', import.meta.url).pathname
mkdirSync(OUT_DIR, { recursive: true })

const routes = [
  ['home', '/'],
  ['apply', '/apply'],
  ['partners', '/partners'],
  ['training', '/training'],
  ['news', '/news'],
  ['map', '/map'],
  ['erart', '/erart'],
  ['verify-email-bad-token', '/verify-email?token=invalidtoken1234567890'],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const results = []
for (const [name, path] of routes) {
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => ({ status: () => 0, error: e }))
  const status = typeof res.status === 'function' ? res.status() : 0
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT_DIR}${name}.png`, fullPage: false })
  results.push({ name, status })
}
// full-page home for the About section check
await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT_DIR}home-full.png`, fullPage: true })
await browser.close()
console.log(JSON.stringify(results, null, 2))
