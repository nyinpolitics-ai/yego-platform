# Going online FREE — YEGO platform deployment guide (₦0 hosting)

This guide gets the platform live on your own domain **today**, using only
free-tier services that require **no credit card**.

The architecture:

```
 [Your domain]  →  Netlify (free)  →  Netlify Functions run the YEGO app (SSR)
                          │
                          └→  Neon PostgreSQL (free)  ← DATABASE_URL
```

| Service | Role | Free tier | Card needed |
|---|---|---|---|
| Netlify | App hosting, SSL, CDN | Yes (300 build credits/mo, functions) | No |
| Neon   | Managed PostgreSQL    | Yes (0.5 GB, autosuspend)          | No |
| Vercel (alternative host) | App hosting | Yes (Hobby) | No |

---

## Step 1 — Create the free database (Neon, ~5 minutes)

1. Sign up at <https://neon.tech> (GitHub or Google login works).
2. Create a project, e.g. `yego-platform`. Any region close to Nigeria
   (e.g. EU West / AWS eu-west-1) is fine.
3. Open **Dashboard → Connection string**, choose **pooled connection**,
   and copy the string. It looks like:
   ```
   postgresql://yego_user:xxxxxxxx@ep-xxx-pooler.region.aws.neon.tech/yego?sslmode=require
   ```
4. Save it as `DATABASE_URL`. Do not commit it anywhere.

## Step 2 — Initialise the database schema

### Option A — browser wizard (no terminal, recommended for non-technical users)

The app ships with a one-time setup wizard. Instead of running anything on
your computer, you open a secret URL after the first deploy:

1. When setting the Netlify environment variables (Step 3), also add
   `SETUP_TOKEN` with a long secret phrase you invent (20+ characters,
   e.g. three random words plus a number).
2. After the deploy finishes, open `https://<your-site>.netlify.app/setup?token=<your phrase>`.
3. The wizard shows the database status and a short form: enter the first
   Super Administrator's name, email and a password (12+ characters), and
   optionally tick **"load sample demonstration data"** for stakeholder
   previews (clear it before going live).
4. Click **Initialise platform** — migrations, geography (36 states + FCT,
   774 LGAs), the administrator account and the optional demo data are all
   created in the cloud. Nothing is installed on your computer.
5. Afterwards: sign in at `/login` to confirm, then delete the `SETUP_TOKEN`
   variable in Netlify and redeploy — the wizard disables itself completely.

### Option B — from your machine (terminal)

In the project folder:

```bash
export DATABASE_URL="postgresql://...neon.tech/yego?sslmode=require"

pnpm install
pnpm db:migrate          # creates all tables (5 migrations)
pnpm db:seed             # reference geography (states/LGAs/wards)
pnpm db:create-admin     # creates the first Super Administrator
                         # (follow the prompts — use a strong password)
```

> **Important:** do NOT run `pnpm db:seed:demo` on a public deployment.
> Demo accounts are for local testing only.

## Step 3 — Deploy the app (Netlify, ~10 minutes)

Option A — **from GitHub** (recommended: auto-deploys on every push):

1. Push this branch to your GitHub repo.
2. Go to <https://app.netlify.com> → **Add new project → Import an existing
   project →** pick the repo.
3. Netlify reads `netlify.toml` automatically:
   build = `corepack pnpm install --frozen-lockfile && corepack pnpm build`,
   publish = `dist/client`.
4. Before the first deploy, add environment variables under
   **Project configuration → Environment variables**:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Neon pooled connection string |
   | `NIN_ENCRYPTION_KEY` | 32-byte base64 key (`openssl rand -base64 32`) |
   | `SESSION_SECRET` | long random string (`openssl rand -hex 32`) |
   | `COOKIE_SECURE` | `true` |
   | `SETUP_TOKEN` | long phrase you invent — enables the `/setup` browser wizard (Step 2 Option A); delete after setup |
   | `RESEND_API_KEY` | Resend API key — switches on applicant confirmation/verification emails |
   | `NOTIFY_EMAIL_FROM` | verified sender, e.g. `YEGO <noreply@yego.ng>` |

   Without `RESEND_API_KEY` the platform still accepts applications and
   records every email in `outbound_messages` as "skipped"; the applicant
   sees an honest "email could not be sent" notice and can retry from
   `/verify-email` once the key is added. No other variable is needed for
   email verification links (they default to `https://yego.ng`; override
   with `SITE_URL` when testing on a preview domain).
5. Deploy. You get a live URL like `https://yego.netlify.app` — the app is
   now online with SSR, server functions and your Postgres database.

Option B — **from your terminal** (no GitHub connect):

```bash
npm i -g netlify-cli          # v17.31 or newer
netlify login
netlify init                  # link/create the site
netlify env:set DATABASE_URL "postgresql://...neon.tech/yego?sslmode=require"
netlify env:set NIN_ENCRYPTION_KEY "<openssl rand -base64 32>"
netlify env:set SESSION_SECRET "<openssl rand -hex 32>"
netlify env:set COOKIE_SECURE "true"
netlify deploy --build --prod
```

## Step 4 — Point your domain at Netlify (free SSL included)

1. In Netlify: **Project configuration → Domains → Add a domain**, enter your
   domain (e.g. `yego.ng` and `www.yego.ng`).
2. At your registrar, add the DNS records Netlify shows you:
   - Apex `yego.ng`  → `A` record → Netlify's load-balancer IP **75.2.60.5**
     (or use Netlify DNS nameservers if you prefer full DNS hosting).
   - `www` → `CNAME` → your Netlify subdomain (`<site>.netlify.app`).
3. Wait for DNS propagation (minutes to a few hours). Netlify issues a free
   Let's Encrypt certificate automatically.

### Registrar walkthrough: SmartWeb Nigeria (`yego.ng`)

The domain is registered at SmartWeb (domain active, managed at
`Managing yego.ng` in their client area). Recommended path — **Netlify DNS**:

1. In Netlify: **Project configuration → Domains → Add a domain** → enter
   `yego.ng` (Netlify auto-includes `www.yego.ng`). Choose **"Set up
   Netlify DNS"** when asked. Netlify shows 4 nameservers, e.g.
   `dns1.p01.nsone.net` … `dns4.p01.nsone.net`, and creates all needed
   records (apex + www) itself.
2. In the SmartWeb client area, on the `Managing yego.ng` page: open the
   **Nameservers / Domain Servers** section, replace the SmartWeb default
   nameservers with the 4 Netlify ones (copy exactly, one per field, no
   `http://`, no trailing dot), and save.
3. Wait for propagation — usually under an hour for a fresh `.ng` domain
   (worst case 24–48 h). Netlify's domain page turns green ("Netlify DNS
   verified") and the Let's Encrypt certificate is issued automatically.
4. Only after the site is live: enable **Registrar Lock** in the SmartWeb
   panel (their own suggestion) so the domain cannot be transferred by
   anyone else. Do not enable it before DNS is confirmed working.

Alternative — keep SmartWeb nameservers and add records manually in their
DNS management section: `A` record host `@` → `75.2.60.5`, `CNAME` record
host `www` → `<site>.netlify.app`. If an existing parking `A` record on `@`
is present, edit it instead of adding a duplicate. The "SSL valid" note in
the SmartWeb panel refers to their parking page — Netlify issues its own
certificate once DNS points at it, so nothing to buy there.

## Step 5 — Verify the live site

- Open the site: home page, `/apply`, `/map`, `/login`.
- Log in with the Super Administrator you created in Step 2.
- Check `/healthz`-equivalent behaviour by loading any Command view.
- Confirm guard logins created via **Command → Access** work.

---

## Alternative host: Vercel (also free, no card)

Vercel deploys TanStack Start through Nitro:

```bash
pnpm add -D nitro
```

```ts
// vite.config.ts — add the nitro() plugin
import { nitro } from 'nitro/vite'
plugins: [tanstackStart(), nitro(), viteReact()],
```

Then `npx vercel` → set the same environment variables in the Vercel
dashboard → point your domain in **Settings → Domains**.

> Note: keep `nitro()` and the Netlify plugin mutually exclusive — the two
> integrations must not both be active in the same build. In this repo the
> Netlify plugin only activates when `NETLIFY=true` (set automatically by
> Netlify's CI), so Vercel builds are unaffected.

## Also supported: your own VPS (SmartWeb/cPanel)

The standalone Node server (`server.mjs`) keeps working exactly as before:
`pnpm build` then `NODE_ENV=production node server.mjs` behind nginx. See
[deploy/smartweb/vps/README.md](deploy/smartweb/vps/README.md).

---

## Costs at a glance

| Item | Price |
|---|---|
| Netlify hosting, SSL, CDN | ₦0 (Free plan) |
| Neon PostgreSQL 0.5 GB | ₦0 (Free plan) |
| Domain | already purchased by you |
| Netlify bandwidth 100 GB/mo, functions included | ₦0 |

When traffic grows beyond the free tiers, Neon scales pay-as-you-go and
Netlify's Pro plan is $9/member per month — but an election-observation
platform of this size comfortably fits the free tiers for a long time.

## Security checklist before going public

- [ ] Rotate every demo password; create real staff via **Command → Access**.
- [ ] `NIN_ENCRYPTION_KEY` generated fresh and stored in a password manager.
- [ ] `COOKIE_SECURE=true` (set above) — sessions only travel over HTTPS.
- [ ] Database credentials exist only in Netlify/Vercel env settings.
- [ ] No demo seed on the public database.
