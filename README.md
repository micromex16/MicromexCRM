# Micromex Lead Engine

Outbound lead engine for [Micromex](https://micromex.com) — USMCA contract manufacturer (Tucson + Imuris, Sonora, est. 1988). Finds US brands importing from China/Vietnam/Taiwan via customs data, enriches them with Claude-powered research, and runs capability-targeted outreach across four service lines: **Electrical**, **Refurb**, **Packaging**, **Mechanical**.

## What's in the box

- **Find:** ImportYeti scraping (CLI / paid API) + CSV upload. Auto-dedupe and capability tagging by HTS chapter.
- **Enrich:** Apollo + Hunter for contacts. Claude (`claude-sonnet-4-6` + `claude-haiku-4-5`) for research briefs, fit scoring, email drafting, reply classification.
- **Pitch:** 8 seeded templates (4 capability buckets × 2 variants). Per-contact personalization, merge tags, daily cap, suppression list, HMAC unsubscribe.
- **Track:** Dashboard, leads list with filters, lead detail with research intel panel, campaign manager, daily digest to your inbox.

## Stack

Next.js 14 (app router) · TypeScript · Tailwind · shadcn/ui · Supabase (Postgres + RLS + Auth) · Anthropic Claude · Resend · Apollo.io / Hunter.io · Playwright (CLI scraper) · Vercel cron · pnpm.

## Quick start

```bash
# 1. clone + install
pnpm install

# 2. fill in .env.local — see below for the full list
cp .env.example .env.local

# 3. create your Supabase project, then apply the migration
#    (option A: paste supabase/migrations/0001_init.sql into the SQL editor)
#    (option B: pnpm dlx supabase link --project-ref <ref> && pnpm dlx supabase db push)

# 4. seed the 8 starter templates + a sample draft campaign
pnpm seed

# 5. run locally
pnpm dev
# open http://localhost:3000 and sign in with your @micromex.com email
```

## Environment variables

See [`.env.example`](.env.example) for the full list. Minimum set to compile + sign in:

| Var | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role secret (server-only, bypasses RLS) |
| `ALLOWED_EMAIL_DOMAIN` | Defaults to `micromex.com` |

To make the engine **actually work**:

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enrichment, scoring, email drafting, reply classification |
| `RESEND_API_KEY` | Outbound email |
| `RESEND_FROM_EMAIL` | Must be on a domain with SPF + DKIM + DMARC verified in Resend |
| `RESEND_WEBHOOK_SECRET` | Signs webhook events and unsubscribe tokens |
| `CRON_SECRET` | Vercel attaches this as `Bearer` on every cron tick |
| `APOLLO_API_KEY` | Primary contact enrichment |
| `HUNTER_API_KEY` | Fallback when Apollo returns nothing |
| `IMPORTYETI_USERNAME` + `IMPORTYETI_PASSWORD` | For the CLI scraper |

## Run book

### Bring in real shipments

**Path A — CSV upload (works everywhere).** Export a search from ImportYeti as CSV, drop it at **/sources**. The parser handles standard column names (Consignee Name, Shipper Country, HS Code, Product Description, Arrival Date, Bill of Lading) and common variants.

**Path B — CLI scrape (dev machine).** With `IMPORTYETI_USERNAME`/`PASSWORD` set:

```bash
pnpm scrape --hts 8544 --since 2026-01-01 --max-pages 5 --country China
```

This dedupes consignees → upserts companies → enqueues research + email_lookup + score jobs.

### Watch enrichment run

Every 10 min (`/api/cron/run-enrichment`), the dispatcher dequeues `ENRICHMENT_BATCH_SIZE` jobs (default 10) and runs each through its handler. Open a lead's **Research** tab to see what Claude produced.

Manually trigger from a lead detail page via the **Run enrichment** button (sticky right rail).

### Launch a campaign

`/campaigns/new` → pick capability bucket → pick template (filtered by bucket) → set min fit score + status filters + daily cap + auto-send or manual review → Launch.

Auto-send mode queues drafts that the `send-batch` cron picks up every 15 minutes during US business hours weekdays. Manual review mode drops drafts into the campaign detail page for you to review before sending.

### Reply handling

When Resend's webhook fires `email.replied`, the system:
1. Records the reply text on the `sends` row
2. Bumps the company's status to `replied`
3. Adds an `activities` row
4. Enqueues a `classify_reply` job (Haiku) that tags the reply `interested` / `not_now` / `not_a_fit` / `unsubscribe` / `auto_oof`
5. The next daily digest at 9am ET surfaces it

Configure the webhook in Resend → URL `https://<your-vercel>.vercel.app/api/webhooks/resend`, sign with `RESEND_WEBHOOK_SECRET`.

## Cron schedule

See [`vercel.json`](vercel.json). Summary:

| Path | Schedule | What |
|---|---|---|
| `/api/cron/scrape-importyeti` | every 6h | (Stub) auto-scrape if paid API key is set |
| `/api/cron/enqueue-enrichment` | every hour at :15 | Scan for new companies needing research / qualified leads missing contacts |
| `/api/cron/run-enrichment` | every 10 min | Dequeue + dispatch enrichment jobs |
| `/api/cron/score-leads` | 4 AM UTC daily | Re-score stale qualified leads (>7d) |
| `/api/cron/send-batch` | every 15 min, M-F 10AM-6PM ET | Send queued emails, respecting daily cap |
| `/api/cron/digest-daily` | 1 PM UTC weekdays | Email overnight digest to `DIGEST_RECIPIENT` |

## Project layout

```
app/
  (app)/              protected routes — sidebar shell
    page.tsx          dashboard
    leads/            list + detail
    campaigns/        list + new wizard + detail
    templates/        list + editor
    composer/         manual email composer
    sources/          scraper + CSV upload
    settings/         env status + sender hygiene
  login/              magic-link sign-in
  auth/               callback + signout
  u/[token]/          public unsubscribe handler
  api/
    cron/             vercel cron endpoints
    webhooks/resend/  inbound resend events
    sources/          scrape + upload + list
    leads/            enrich, note, contacts
    campaigns/        create + launch
    composer/         draft + send
    templates/        update + deactivate
components/
  ui/                 shadcn primitives
  layout/             sidebar, topbar
  common/             score, capability, status badges + empty state
  dashboard/          stat cards + recharts wrappers
  leads/              filters, research intel, activity timeline, actions
  sources/            scrape form, csv dropzone
lib/
  supabase/           client, server, service-role, middleware
  types/              database (gen) + domain (hand-maintained)
  ingest/             csv, normalize, dedupe, apollo, hunter, importyeti
  enrichment/         research, score, draft, classify_reply, router, shipments-summary
  outreach/           render, send, suppression, cap, digest, seed-templates
  anthropic.ts        claude client
  resend.ts           resend client
  jobs.ts             enrichment queue helpers
  cron.ts             cron auth helper
  dashboard.ts        server-side aggregations
  env.ts              zod env validation
  auth/require.ts     server-side auth helpers
supabase/
  migrations/0001_init.sql   full schema (10 tables, 12 enums, RLS, indexes, triggers)
scripts/
  seed.ts             seed templates + sample campaign
  scrape.ts           manual ImportYeti scrape
```

## Build status

See [BUILD_LOG.md](BUILD_LOG.md) for what was built, what's stubbed, and the pre-launch checklist.

---

Micromex · Est. 1988 · USMCA contract manufacturer.
