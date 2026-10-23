// Standalone production server for SmartWeb (cPanel Node.js / Passenger) or any
// Node 22+ host. It serves the built client assets and sends every other
// request through the TanStack Start SSR/server-function handler.
//
// Build first:  pnpm build
// Start:        NODE_ENV=production node server.mjs
//
// Required environment: DATABASE_URL (managed PostgreSQL), NIN_ENCRYPTION_KEY,
// optional SESSION_SECRET, COOKIE_SECURE=true on HTTPS, PORT (provided by host).
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'

const root = resolve(process.cwd())
const clientDir = resolve(root, 'dist/client')

try {
  process.loadEnvFile?.('.env')
} catch {
  // .env is optional; hosts normally inject environment variables.
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
}

const { default: server } = await import('./dist/server/server.js')

function safeFilePath(pathname) {
  const candidate = resolve(clientDir, `.${decodeURIComponent(pathname)}`)
  if (candidate !== clientDir && !candidate.startsWith(`${clientDir}${sep}`)) return null
  return candidate
}

function sendFile(req, res, filePath) {
  const stats = statSync(filePath)
  const type = mime[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  res.statusCode = 200
  res.setHeader('content-type', type)
  res.setHeader('content-length', stats.size)
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader(
    'cache-control',
    filePath.includes(`${sep}assets${sep}`) || pathnameIsImmutable(filePath)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600',
  )
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath).pipe(res)
}

function pathnameIsImmutable(filePath) {
  return /\.(png|jpe?g|webp|svg|ico|woff2?)$/i.test(filePath)
}

const serverInstance = createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? `localhost:${process.env.PORT ?? 3000}`
    const protocol = req.headers['x-forwarded-proto'] ?? 'http'
    const url = new URL(req.url ?? '/', `${protocol}://${host}`)

    if (url.pathname === '/healthz') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, service: 'yego', time: new Date().toISOString() }))
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const filePath = safeFilePath(url.pathname)
      if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
        sendFile(req, res, filePath)
        return
      }
    }

    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue
      headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: hasBody ? 'half' : undefined,
    })

    const response = await server.fetch(request)
    res.statusCode = response.status
    const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-encoding' || key.toLowerCase() === 'set-cookie') return
      res.setHeader(key, value)
    })
    if (setCookies.length) res.setHeader('set-cookie', setCookies)
    if (!response.body) {
      res.end()
      return
    }
    Readable.fromWeb(response.body).pipe(res)
  } catch (error) {
    console.error('[yego] request failed', error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('content-type', 'text/plain; charset=utf-8')
    }
    res.end('An unexpected server error occurred.')
  }
})

const rawPort = process.env.PORT
const isSocket = rawPort && isNaN(Number(rawPort))
const port = isSocket ? rawPort : Number(rawPort ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

if (isSocket) {
  serverInstance.listen(port, () => {
    console.log(`YEGO is listening on socket ${port}`)
  })
} else {
  serverInstance.listen(port, host, () => {
    console.log(`YEGO is running on http://${host}:${port}`)
  })
}

function shutdown(signal) {
  console.log(`[yego] ${signal} received, closing server`)
  serverInstance.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
