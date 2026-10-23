import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The Netlify plugin is only loaded when building on Netlify (their CI sets
// NETLIFY=true). Local builds and the standalone `server.mjs` path used on a
// VPS are unaffected and keep producing dist/client + dist/server/server.js.
const isNetlify = !!process.env.NETLIFY

let plugins = [
  tailwindcss(),
  tanstackStart(),
  viteReact(),
]

if (isNetlify) {
  // Official Netlify integration for TanStack Start (SSR via Netlify Functions).
  // Dynamically imported so the dependency is not required for VPS builds.
  const { default: netlify } = await import('@netlify/vite-plugin-tanstack-start')
  plugins = [tailwindcss(), netlify(), tanstackStart(), viteReact()]
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins,
})

export default config
