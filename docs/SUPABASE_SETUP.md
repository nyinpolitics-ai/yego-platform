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

1. **Transaction Pooler (Port 6543)** — **Recommended for Application Server (Render / VPS)**
   - Format: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require`
   - Use this as `DATABASE_URL` in your production application environment (`render.yaml` or `.env`).
   - Handles connection spikes gracefully across server instances without exhausting database connections.

2. **Direct Connection (Port 5432)** — **Recommended for Migrations and CLI Scripts**
   - Format: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require` (Session pooler) or direct host on port 5432.
   - Required for `pnpm db:migrate` because migration locking uses `pg_advisory_lock()`, which requires session-level state.

---


### TLS / SSL Certificate Verification

Supabase uses its own Root Certificate Authority (`Supabase Root 2021 CA`) rather than public Web PKI roots for pooler TLS. The platform supports strict TLS verification (`rejectUnauthorized: true`) through multiple mechanisms:

1. **Automatic Repository Certificate:**
   The repository includes the official public `certs/supabase-ca.crt` (Supabase Root 2021 CA). If present, the Node.js `pg` client automatically enables strict certificate validation without any manual setup.

2. **Environment Variable (`DATABASE_CA_CERT`):**
   In cloud environments like Render, you can supply the raw certificate PEM content in the `DATABASE_CA_CERT` environment variable.

3. **Custom Path (`DATABASE_CA_CERT_PATH`):**
   Point to a custom certificate file on disk if stored outside the default `certs/` directory.

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

Once `DATABASE_URL` is configured in your local `.env`:

### Run Migrations
```bash
pnpm db:migrate
```
This applies the 4 database migrations located in `netlify/database/migrations/`:
1. `0001_init.sql` — Schema definition, tables, constraints, triggers, and enum types.
2. `0002_sequences.sql` — Sequential ID generators for YEGO IDs.
3. `0003_polling_unit_index.sql` — Performance index for polling unit lookups.
4. `0004_seed_reference_geography.sql` — Production seed: 36 states + FCT, and all 774 LGAs.

### (Optional) Seed Reference Geography Independently
```bash
pnpm db:seed
```

### Create Super Administrator
```bash
ADMIN_EMAIL="admin@yego.ng" ADMIN_NAME="Super Administrator" pnpm db:create-admin
```
The script will prompt securely for the admin password without echoing to terminal history.

---

## 4. Render Deployment

The repository includes a ready-to-deploy [`render.yaml`](../render.yaml) blueprint:

1. Push your repository to GitHub.
2. In the Render Dashboard, click **New + -> Blueprint**.
3. Select your `yego-platform` repository.
4. Render will detect `render.yaml` and prompt you to input the secret environment variables (`DATABASE_URL`, `NIN_ENCRYPTION_KEY`, `SESSION_SECRET`).
5. Click **Apply** to deploy.
