# Backend Implementation Report

**Date:** 19 October 2026  
**Scope:** production backend, persistent database, authentication, role scoping, incident notifications, public pages and partner content.  
**Environment:** macOS, Node 24.14, pnpm 10.32, Netlify CLI 26.0.2.

## 1. Audit result

**No persistent application database existed in the repository.** All operational data was held in `localStorage` through `src/lib/demo-store.ts`, seeded from `src/lib/fixtures.ts`. There were no migrations, schema files, ORM models, connection strings, server functions, sessions or audit tables.

The Netlify dev plugin had provisioned a local PostgreSQL 17.5 cluster in `.netlify/db` with its connection string in `.netlify/state.json`, but it contained no application tables. Production Netlify Database was **not enabled** and the project was **not linked** to a Netlify site.

## 2. What was provisioned

- **Engine:** PostgreSQL 17.5 (local Netlify dev cluster; standard PostgreSQL for production).
- **Connection:** `pg` Pool in `src/server/db.server.ts`, using `DATABASE_URL`, then `NETLIFY_DATABASE_URL`, then `.netlify/state.json` in development.
- **Migrations:** `db/migrations/0001_init.sql`, `0002_sequences.sql`; both applied and recorded in `schema_migrations`.
- **Reference data:** 37 states (36 + FCT), 774 LGAs, 176,846 polling-unit total; official polling units intentionally not fabricated.
- **Development seed:** 14 applications, 6 incidents, 4 early warnings, 4 announcements, 6 accounts. The demo seed refuses `NODE_ENV=production` unless `ALLOW_DEMO_SEED=1`.

Verified counts after reset:

| Table | Rows |
| --- | --- |
| applications | 14 |
| users | 6 |
| incidents | 6 |
| incident_history | 17 |
| early_warnings | 4 |
| announcements | 4 |
| notifications | 5 |
| states | 37 |
| lgas | 774 |

## 3. Workflows now using the database

- Public application submission (server-generated ID, encrypted NIN, consent records, history, audit).
- Status lookup requiring Application ID + phone, with masking and rate limiting.
- WhatsApp confirmation state.
- Command and Guard sign-in, sessions, logout and login throttling.
- Guard portal application, reports, training, check-in and early-warning tips.
- Incident creation, evidence metadata, verification transitions, notes and agency referrals.
- Applicant screening, role-gated status transitions, certification and polling-unit assignment.
- Command dashboard, incident queue, screening table, shared updates and alerts.
- Per-user notifications with geographic scope.
- Audit log for sensitive actions.

No operational record uses browser storage as its source of truth.

## 4. Authentication and authorization

- scrypt password hashing; 32-byte session tokens stored as SHA-256 hashes.
- HttpOnly, SameSite=Lax cookies; `Secure` in production; seven-day expiry.
- Database-backed login throttling (8 failures / 15 minutes) and status-lookup throttling (10 failures / 15 minutes).
- Same-origin validation on every mutation.
- Server-side role capability checks and geographic predicates.
- Super Administrator remains the only role with full platform control.
- Verification Officer limited to incidents; Training Officer limited to training and shared updates.
- State/LGA coordinators cannot read or mutate records outside their area.
- Guards only receive their own application and reports.

## 5. Role, notification and information-sharing changes

- Added the `view:incidents` capability so incident visibility is separate from general analytics.
- Command navigation follows the permission matrix; Training Officer no longer sees the incident queue or screening table.
- State Coordinator dashboard remains locked to its state (verified in the browser: state selector disabled, Lagos-only KPIs and incidents).
- Incident notifications are written to every scoped Command user; the UI polls every 20 seconds and opens a Command alerts dialog.
- Notification dialog now renders above Leaflet controls (z-index corrected).
- Shared updates view lets every Command role read a common board; posting is scoped by role and geography.

## 6. Front-end changes requested

- **`/map` built:** Google Maps embed with state selection, Google Maps external links, national and state coverage, LGA/PU totals. Uses the official Embed API when `VITE_GOOGLE_MAPS_API_KEY` is present, otherwise the keyless embed.
- **`/training` built:** public curriculum, module durations, assessment counts, certification and portal CTAs. Typecheck is now clean.
- **Login:** preview-account list and shared password removed from the UI. Accounts still exist for development; production bootstrap uses `pnpm db:create-admin`. No credential values were changed in the seeded environment.
- **Partner page:** ten logos extracted from the supplied partnership brief and published on the homepage and `/partners`, with names, categories, descriptions and the brief’s contact details. A note flags that partner names/marks/descriptions need partner approval before public launch.
- **Footer:** added the Partners link.

## 7. Tests and verification

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| `pnpm test` (unit/component) | 25 passed |
| `pnpm test:integration` | 13 passed |
| `pnpm build` | Pass |
| Client bundle secret scan | No database URL, password hash, NIN key or server request helper present |
| Migrations on a fresh schema | Applied successfully |
| Migration re-run | Idempotent (skipped) |

Integration tests cover:

1. Application persistence and retrieval in a new connection.
2. Unique application IDs under six concurrent submissions.
3. Status lookup masking and wrong-phone rejection.
4. Application workflow and capability enforcement.
5. Certification blocked before training completion.
6. Server-validated training attempts and progress.
7. State-scope and Guard-scope isolation.
8. Out-of-scope application decisions rejected.
9. Incident persistence, history and scoped notifications.
10. Invalid incident transitions rejected.
11. Referrals recorded truthfully as `pending_manual`.
12. Assignment capability enforcement and persistence.
13. Database health precondition.

Browser verification performed:

- Command login and dashboard rendered from PostgreSQL (82,614 registered / 53,907 verified / 6 incidents).
- Guard login and portal rendered the seeded application and reports.
- A Guard submitted an incident through Election-Day Mode: `INC-2026-001006`.
- A Verification Officer moved a report through review and verification; the audit trail updated.
- Command alerts pop-up showed the new scoped incident.
- Lagos State Coordinator received a Lagos-only dashboard and Lagos-only alert.
- `/map`, `/training`, `/partners` and shared updates rendered without runtime errors.

## 8. Security limitations

- No MFA or privileged recovery flow yet.
- First-party sessions are an interim identity implementation; Netlify Identity is not configured.
- Evidence binary storage is disabled; only evidence metadata is recorded.
- Applicant photos are size-limited data URLs in PostgreSQL, not private object storage.
- No malware scanning or short-lived signed download URLs.
- NIN encryption requires a production key; the development fallback must not be used with real data.
- Lawful basis for collecting real NIN still needs approval.
- Rate limits are database-backed but not a distributed edge WAF.
- Partner marks must be approved by each organisation before publication.
- Application reads are scoped, but field-level read auditing and retention automation are not implemented.

## 9. External dependencies still required

1. Link a Netlify site and provision the production Netlify Database.
2. Set `NETLIFY_DATABASE_URL`/`DATABASE_URL`, `NIN_ENCRYPTION_KEY`, `SESSION_SECRET`, `ADMIN_*` and `VITE_GOOGLE_MAPS_API_KEY` in the deployment.
3. Run migrations and reference seed against production.
4. Rotate/remove the development demo accounts.
5. Approve NIN lawful basis and retention.
6. Provide private evidence storage and scanning.
7. Import the official INEC polling-unit register.
8. Configure WhatsApp/SMS/agency integrations; referrals remain manual until then.
9. Confirm partner names and marks.
10. Decide on MFA and the production identity provider.

## 9a. Post-review corrections (second implementation pass)

The YEGO officials’ corrections were implemented on top of the backend:

1. **Community onboarding.** The application success screen now makes joining the YEGO WhatsApp community the required next step before tracking. The portal shows a join banner when confirmation is outstanding. The URL is configurable with `VITE_WHATSAPP_CHANNEL_URL`; the owner must supply the final link.
2. **Cascading location fields.** State → LGA → ward are all selects. The ward list is the 8,809-ward national dataset reconciled to the 774 LGAs; LGA and ward can no longer be typed. Preferred polling unit is a select fed from the imported INEC register (176,834 rows), with a coordinator-assignment default when no unit matches.
3. **ERART Dashboard.** Added the public `/erart` page explaining the YEGO Early Warning & Rapid Response Tool, renamed the Command landing view to “ERART Dashboard” and added the ERART link to the header.
4. **News isolated to `/news`.** Removed the old placeholder news from the homepage and fixtures. Added a dedicated `/news` page with the supplied police partnership, 300,000 Guards, Osun guardrails, INEC 100-day/ERARM, Peace Corps, Man O’War, DSS, Democracy Must Not Be Blocked and INEC press-conference coverage, with source links. The homepage now only links to the news page.
5. **Training Dashboard.** Renamed to “YEGO National Training Centre — The Electoral Accountability Academy”, with the tagline “Training Today’s Youth. Protecting Tomorrow’s Democracy.” Added the six dashboard metrics (registration, training, modules completed, assessment score, certification, assigned state/LGA) and the eight-step training process. Expanded the curriculum to nine modules, including Electoral Violence Prevention and Field Preparedness and Practical Assessment; every module is 20–30 minutes. The certified demo Guard shows 9 of 9 modules and an 85% assessment score.
6. **SmartWeb hosting.** Added `server.mjs` (standalone Node SSR + static asset server), `app.js`/`package.json` entry points and `deploy/smartweb/README.md` with Node 22+, PostgreSQL, cPanel/Passenger, environment, migration, domain and SSL instructions.

All checks were rerun after these changes: typecheck, lint, 25 unit tests, 13 integration tests and the production build pass. The SmartWeb-style production server was tested on `http://localhost:3001` (homepage, news, ERART, training, partners, map, wards data, health check and login).

## 9b. Role access corrections (third implementation pass)

- **National YEGO Administrator** can report an incident directly from the ERART dashboard or incident page, access the incident queue, and forward verified incidents to any of the 11 agencies.
- **Verification Officer** can access Guards & screening, approve/verify applicants, and send direct messages that appear in the applicant's portal inbox.
- **State Coordinator** has the same operational views and capabilities as the Super Administrator within the Lagos state scope, except role management; the state selector remains locked.
- **Training Officer** has a dedicated Training Dashboard showing every applicant's modules, assessment score, certification state and last activity; it can record progress, message the applicant and export a CSV progress report.
- Direct applicant messages are stored as notifications, mirrored in application history and displayed in the applicant/Guard portal inbox.
- Integration tests now cover National incident reporting, Verification Officer approval/messaging, Training Officer progress updates and State Coordinator operational access.

## 10. Files added or changed

- `db/migrations/0001_init.sql`, `0002_sequences.sql`
- `scripts/db.mjs`, `migrate.mjs`, `seed.mjs`, `create-admin.mjs`
- `src/server/db.server.ts`, `security.server.ts`, `auth.server.ts`, `scope.server.ts`, `dto.server.ts`, `validation.server.ts`, `repo.server.ts`, `functions.ts`
- `src/server/database.integration.test.ts`, `vitest.integration.config.ts`
- `src/lib/demo-store.ts` (server-backed), `permissions.ts`, `partners.ts`
- `src/routes/map.tsx`, `training.tsx`, `partners.tsx`, `status.tsx`, `login.tsx`, `apply.tsx`, `command.tsx`, `portal.tsx`
- `src/components/command/notifications.tsx`, `updates.tsx`
- `src/components/portal/quick-report.tsx`, `training-centre.tsx`
- `public/img/partners/*.png`
- `.env.example`, `README.md`, `docs/BACKEND_ARCHITECTURE.md`

## 11. Production readiness statement

The application is ready for a controlled staging deployment on a provisioned PostgreSQL database. It is **not** ready for open public launch until the external dependencies and security limitations above are resolved. Closed beta is recommended.

## 9c. Fourth implementation pass — Command Centre completion and outbound notifications (23 October 2026)

This pass closed three missing Command views, made the duty promise real, and implemented outbound SMS/WhatsApp with truthful, auditable delivery records.

### What was built

1. **Early-warning board (`/command` → “Early warning”).** Early warnings now carry a resolution workflow (`resolved_at`, `resolved_by`, `resolution_note`, migration `0005`). Command roles with `raise:early-warning` can escalate one level at a time (Watch → Alert → Urgent), change the publication audience (`Command only` → `State coordinators` → `All Guards in area`) and resolve with a note. Escalation to Urgent writes scoped notifications to every Command user with `view:early-warning`. Every action is audited. Scope enforcement rejects warnings outside the user's area.
2. **Coverage & duty board (`/command` → “Coverage & duty”).** New server aggregate `getCoverage` computes, per state in scope: total applications, certified Guards, distinct assigned polling units, the polling-unit register size (from the imported register when present, otherwise labelled as the INEC estimate) and **distinct Guards checked in today (Africa/Lagos)**. The duty board lists each Guard's latest check-in (name, PU, LGA/state, time, map link) — the portal's “your coordinator can see you are on duty” promise is now backed by a real view. The Guard portal also shows the server-backed last check-in time instead of component-local state.
3. **Roles & access admin (`/command` → “Roles & access”, Super Administrator only).** Lists Command accounts with role, scope, last sign-in and status; creates accounts (scope derived from role: national / zone / state / LGA / training), with optional auto-generated one-time passwords; deactivates/reactivates accounts (sessions revoked on deactivation); changes roles atomically. Guard rails: cannot deactivate yourself, cannot change your own role, and at least one active Super Administrator must always remain. The capability matrix is rendered from `ROLE_MATRIX`.
4. **Outbound notifications (Twilio SMS + Meta WhatsApp Cloud API).** New `src/server/notify.server.ts` renders three templates (`application.received`, `application.status`, `applicant.message`) and queues a message in `outbound_messages` (migration `0005`) for every application submission, application status change and direct applicant message. Delivery is attempted after the business transaction commits and never blocks or breaks the workflow. Providers are configured purely from environment variables (`META_WHATSAPP_TOKEN`/`META_WHATSAPP_PHONE_NUMBER_ID`, `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`, `NOTIFY_CHANNEL=auto|whatsapp|sms`, `NOTIFY_DISABLED=1`). With no provider configured, messages are recorded with status `skipped` and an honest reason. Failed provider calls record the provider's error message. Agency referrals remain `pending_manual` — the system still does not claim agency delivery.

### Tests

- Unit suite: 29 tests (12 pre-existing + 17 new for the notify module: E.164 conversion, channel resolution, config detection, request builders, response parsers, templates).
- Integration suite: 32 tests (17 pre-existing + 15 new covering the warning workflow and scope rejection, coverage aggregation and scope isolation, roles administration including guard rails, and outbound message recording/success/failure with a stubbed transport).
- The new tests caught and fixed a real SQL-parameter bug in the duty counters for state/LGA-scoped users.

### Remaining owner actions (updated)

1. SmartWeb VPS database verification and administrator bootstrap.
2. Private evidence storage, malware scanning and short-lived download URLs (evidence is still metadata-only).
3. Import the official INEC polling-unit register (`pnpm db:import:pus`) — coverage percentages currently fall back to INEC per-state estimates with an explicit label.
4. Configure Twilio/Meta credentials to activate outbound delivery; agency referral delivery remains manual.
5. Decide on MFA and the production identity provider.
6. NIN lawful-basis approval; rotate demo accounts before any real deployment.
