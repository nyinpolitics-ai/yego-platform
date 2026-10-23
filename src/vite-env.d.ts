/// <reference types="vite/client" />

// Raw SQL imports used by the bootstrap wizard (src/server/setup.server.ts).
declare module '*.sql?raw' {
  const content: string
  export default content
}
