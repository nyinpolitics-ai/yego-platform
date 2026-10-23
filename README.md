# YEGO — Youth Electoral Guards Observers

Public website and operational platform for YEGO, Nigeria’s youth-led election observation, early-warning and incident-reporting mission. Guards apply, train, get deployed and report. Command screens applicants, verifies incidents and refers them to response agencies.

**Stack:** TanStack Start (React 19), Vite 8, Tailwind CSS 4, shadcn/ui, Leaflet + OpenStreetMap, Google Maps embeds, PostgreSQL, SmartWeb VPS.

## What is persistent

Applications, applicants, guards, incidents, evidence metadata, verification history, referrals, early warnings, training attempts, certificates, check-ins, announcements, notifications and audit logs are stored in PostgreSQL. The browser no longer holds the authoritative copy of any operational record.

The only browser storage used by the application is TanStack Router’s in-memory routing state; there is no localStorage fallback.

## Quick start

```bash
pnpm install
# Configure DATABASE_URL for a local PostgreSQL database first
pnpm db:migrate          # create/upgrade the schema
pnpm db:seed:demo        # reference data + development demo records
pnpm db:import:pus       # import the INEC polling-unit register (optional but needed for PU selects)
```

The local app is available at `http://localhost:3000` while `pnpm dev` runs.

`pnpm dev` starts the Vite development server; set `DATABASE_URL` to a running local PostgreSQL instance before migrating or testing database workflows.

### Development demo accounts

These exist only when `db:seed:demo` has been run. They are not created in production.

| Door | Credential |
| --- | --- |
| Command | `command@yego.ng`, `verify@yego.ng`, `lagos@yego.ng`, `superadmin@yego.ng`, `training@yego.ng` |
| Command password | `yego-preview` |
| Guard / Applicant | `YG-APP-242858` / `08031250405` (certified Guard) |
| Guard / Applicant | `YG-APP-245604` / `08031266243` (applicant in training) |

The login page no longer prints these credentials. Rotate them before any real deployment.

## Database

- Engine: PostgreSQL 15+ (development and production require a configured PostgreSQL instance).
- Migrations: `netlify/database/migrations/*.sql`, applied in filename order and recorded in `schema_migrations` with checksums.
- Schema reference: [docs/BACKEND_ARCHITECTURE.md](docs/BACKEND_ARCHITECTURE.md).
- Sequences generate public references: `YG-APP-######`, `INC-YYYY-######`, `EW-YYYY-####`, `YEGO-CERT-####`.

Commands:

```bash
pnpm db:migrate           # apply pending migrations (idempotent, advisory-locked)
pnpm db:seed              # reference states/LGAs only — safe for production
pnpm db:seed:demo         # reference + demo records (refuses NODE_ENV=production)
pnpm db:seed:reset        # wipe demo tables and reseed demo records
pnpm db:create-admin      # create/update a Super Administrator from ADMIN_* env vars
```

`db:seed:demo` refuses to run with `NODE_ENV=production` unless `ALLOW_DEMO_SEED=1`. Never enable that flag against production data.

### Production database

For SmartWeb VPS deployment, follow [deploy/smartweb/vps/README.md](deploy/smartweb/vps/README.md). Configure PostgreSQL and `DATABASE_URL`, run `pnpm db:migrate` and `pnpm db:seed`, then securely create the first administrator using `pnpm db:create-admin`. Do not seed demo data on production.

For free hosting (Netlify + Neon, no credit card) with custom-domain setup, follow [DEPLOY-FREE.md](DEPLOY-FREE.md).

Any PostgreSQL provider reachable via `DATABASE_URL` works with the standard `pg` driver.

## Authentication and roles

- First-party session authentication: scrypt password hashes, random session tokens stored as SHA-256 hashes, HttpOnly/SameSite=Lax cookies (`Secure` in production), seven-day expiry, database-backed rate limiting.
- Two entry points: Command staff (email + password) and Guard/Applicant (Application ID + phone).
- Authorization is enforced in the server repository, not only in the UI. Roles and geographic scope are defined in `src/lib/permissions.ts` and `src/server/scope.server.ts`.
- Super Administrator manages everything; every other role is limited to its remit and area. State Coordinators are locked to their state; LGA Coordinators to their LGA.
- Shared updates give Command roles a common, scoped information board.
- Incident alerts are written to the database and polled by the Command UI every 20 seconds; the pop-up shows only records inside the user’s scope.
- **Command Centre views:** ERART dashboard, incident queue, **early-warning board** (escalate Watch → Alert → Urgent, publish to a wider audience, resolve with a note), **coverage & duty** (state-level aggregates from live data, duty board of guard check-ins), guards & screening, shared updates, training dashboard and **roles & access** (Super-Administrator-only account management with the capability matrix).

## Privacy and security

- NIN is encrypted with AES-256-GCM before storage and only the last four digits are retained for display.
- Status lookup requires Application ID **and** phone, is rate-limited, and returns a masked record without NIN, phone, email or internal notes.
- Evidence is currently stored as metadata only; binary evidence is deliberately disabled until private object storage, malware scanning and short-lived download URLs are configured.
- Every consequential workflow action writes an audit entry with actor, timestamp and note.
- Referrals default to `pending_manual`; the system does not claim delivery or acknowledgement without a configured integration.
- Outbound SMS/WhatsApp messages are recorded in `outbound_messages` before delivery is attempted. Without a configured provider every message is stored with status `skipped` and an honest reason — nothing is sent, nothing is claimed. Configure Meta WhatsApp Cloud API or Twilio (below) to enable real delivery.
- Read [docs/BACKEND_ARCHITECTURE.md](docs/BACKEND_ARCHITECTURE.md) and [docs/BACKEND_IMPLEMENTATION_REPORT.md](docs/BACKEND_IMPLEMENTATION_REPORT.md) before deployment. The application should stay in closed beta until the remaining owner actions are complete.

## Environment variables

Copy `.env.example` to `.env` for local overrides. Names only:

- `DATABASE_URL` (server-only PostgreSQL connection)
- `NIN_ENCRYPTION_KEY` (32 bytes, base64)
- `SESSION_SECRET`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`
- `VITE_GOOGLE_MAPS_API_KEY`
- `ALLOW_DEMO_SEED`

Outbound notifications (server-only, all optional):

- `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID` — WhatsApp via the Meta Cloud API
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID` — SMS via Twilio
- `NOTIFY_CHANNEL` — `auto` (default: WhatsApp if configured, else SMS), `whatsapp` or `sms`
- `NOTIFY_DISABLED` — set to `1` to stop delivery while still recording attempts

Never commit `.env` or production credentials.

## Public pages

- `/` — recruitment homepage and links.
- `/apply` — four-step application with cascading state → LGA → ward → polling-unit selects.
- `/status` — application tracking with Application ID + phone.
- `/erart` — ERART (Early Warning & Rapid Response Tool) dashboard overview.
- `/news` — announcements, partnerships and press coverage. News is kept off other pages.
- `/training` — Training Dashboard for the Electoral Accountability Academy.
- `/map` — Google Maps coverage map.
- `/partners` — strategic partners and contact details.

## Google Maps

`/erart` explains the Early Warning & Rapid Response Tool. `/news` carries the supplied engagements, partnerships and press coverage. `/training` is the Training Dashboard for the Electoral Accountability Academy.

`/map` uses Google Maps embeds. With `VITE_GOOGLE_MAPS_API_KEY` set, it uses the official Embed API; without a key it uses the keyless Google Maps embed. “Open in Google Maps” links are available for every state, and incident records link to their coordinates.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Vite + Netlify dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript, strict mode |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit/component tests |
| `pnpm test:integration` | PostgreSQL integration tests |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Reference geography only |
| `pnpm db:seed:demo` | Development demo data |
| `pnpm db:seed:reset` | Reset and reseed demo data |
| `pnpm db:import:pus` | Import/refresh the INEC polling-unit register |
| `pnpm db:create-admin` | Bootstrap a Super Administrator |

## Project structure

```
netlify/database/migrations/    SQL migrations (legacy folder name; usable on SmartWeb)
scripts/                migration, seed and admin bootstrap scripts
src/routes/             public pages, application, status, login, portal, command
src/components/         brand, portal, Command and UI components
src/lib/                domain types, permissions, reference data, server-backed store
src/server/             db, auth, scope, validation, repository and server functions
docs/                   architecture, implementation report and existing notes
```

## SmartWeb hosting

A standalone Node server is included for SmartWeb/cPanel: `server.mjs` and `app.js`, with the production build in `dist/`. See [deploy/smartweb/README.md](deploy/smartweb/README.md) for Node 22+, PostgreSQL, cPanel startup, environment and domain/SSL instructions.

## Status

Production-shaped backend is implemented and verified against a provisioned local PostgreSQL database. SmartWeb VPS database verification and administrator bootstrap, private evidence storage, MFA/identity provider decisions, the INEC polling-unit import and agency referral delivery remain tracked in the implementation report. The Command Centre now includes the early-warning board, the coverage & duty board (reading live guard check-ins) and the roles & access admin; outbound SMS/WhatsApp notifications to applicants are implemented for Twilio and Meta WhatsApp Cloud API and are recorded truthfully (as `skipped`) until credentials are configured. The public site, applicant status tracking and authorized Command workflows read and write database records.
