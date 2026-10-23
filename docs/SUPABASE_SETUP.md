# Supabase Setup & Migration Guide for YEGO Platform

This guide documents how to connect the YEGO Platform to Supabase once database access is provisioned.

The YEGO codebase uses pure, parameterized PostgreSQL (Node.js `pg` driver) and does **not** require Supabase client libraries or Supabase Auth. It uses Supabase as a high-performance, managed PostgreSQL database and connection pooler.

---

## 1. Supabase Project Architecture

When creating your Supabase project:
- **Region:** Choose a region close to your target audience or hosting server (e.g. Frankfurt `eu-central-1` or London `eu-west-2` for lowest latency to Nigeria).
- **PostgreSQL Version:** 15+ (default on Supabase).

### Connection String Endpoints

Supabase provides two connection strings in **Project Settings -> Database**:

1. **Transaction Pooler (Port 6543)** - **Recommended for Application Server (Render / VPS)**
   - Format: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require`
   - Use this as `DATABASE_URL` in your production application environment (`render.yaml` or `.env`).
   - Handles connection spikes gracefully across server instances without exhausting database connections.

2. **Direct Connection (Port 5432)** - **Recommended for Migrations and CLI Scripts**
   - Format: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require` (Session pooler) or direct host on port 5432.
   - Required for `pnpm db:migrate` because migration locking uses `pg_advisory_lock()`, which requires session-level state.

---

## 2. Environment Variables Configuration

Set these variables in your hosting environment (e.g. Render Dashboard or `.env`):

```bash
# Production Transaction Pooler (Port 6543)
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require"

# Pool limit (recommended: 10 for single-instance, or lower if running multiple web workers)
DB_MAX_CONNECTIONS=10

# 32 random bytes, base64-encoded for AES-256-GCM NIN encryption
# Generate via: openssl rand -base64 32
NIN_ENCRYPTION_KEY="[YOUR-SECURE-KEY]"

# Long random session secret
# Generate via: openssl rand -hex 32
SESSION_SECRET="[YOUR-SECURE-SECRET]"

# Force HTTPS cookies in production
COOKIE_SECURE="true"

# Server network binding
PORT="3000"
HOST="0.0.0.0"
```

---

## 3. Applying Database Schema to Supabase

Run the canonical migrations from your administrative machine targeting the Supabase direct connection URL:

```bash
# 1. Run migrations (applies 0001_init.sql to 0004_seed_reference_geography.sql)
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@[DIRECT-HOST]:5432/postgres?sslmode=require" pnpm db:migrate

# 2. Seed official states and LGAs (safe for production)
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@[DIRECT-HOST]:5432/postgres?sslmode=require" pnpm db:seed

# 3. Create the Super Administrator account
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@[DIRECT-HOST]:5432/postgres?sslmode=require" \
  ADMIN_EMAIL="admin@yego.ng" \
  ADMIN_NAME="National Administrator" \
  ADMIN_PASSWORD="[SECURE-LONG-PASSWORD]" \
  pnpm db:create-admin

# 4. Import the official 176,000+ INEC polling units (run once)
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@[DIRECT-HOST]:5432/postgres?sslmode=require" pnpm db:import:pus
```

---

## 4. Supabase Storage (Future Phase)

Currently, applicant photographs are captured and stored in `applications.photo_data`. In a future storage optimization phase, Supabase Storage buckets can be provisioned:

- **`applicant-photos`**: Private bucket for Guard ID photographs.
- **`incident-evidence`**: Private bucket for incident photos, videos, and documents.

Access policies should allow authenticated Command Staff to view evidence, while Guards can only upload during incident reporting.

---

## 5. Verification Checklist

After configuring the connection:
- [ ] Test health endpoint: `GET /healthz` returns `{"ok":true,"service":"yego"}`.
- [ ] Sign in with the Super Administrator account at `/login` under **Command Staff**.
- [ ] Submit a test application at `/apply` and verify it appears in Command Center.
- [ ] Check `/status` with the generated Application ID and phone number.
- [ ] Check audit log entries in PostgreSQL table `audit_log`.
