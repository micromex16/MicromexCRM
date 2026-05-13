# Build log — Micromex Lead Engine

Built 2026-05-13 in one go. Original spec: 6-agent decomposition, but parallel worktree agents couldn't spawn in this environment so the work happened sequentially, module by module.

## What was built

**Foundation** (commit `feat(foundation)`)
- Next.js 14 app router, TypeScript, Tailwind, shadcn primitives, Inter Tight headings
- Postgres schema: 10 tables, 1 view, 22 enums/types, full RLS, updated_at triggers, GIN/BTREE indexes
- Magic-link auth gated to `@micromex.com` via middleware + callback
- Sidebar/topbar shell, Micromex Blue palette (`mx-50` → `mx-900` + `accent-amber`)
- Lib helpers: env (zod), supabase clients (browser + server + service-role), anthropic client, resend client, cron auth, enrichment job queue (enqueue/dequeue/markDone/markFailed)

**Ingest** (commit `feat(ingest)`)
- ImportYeti CSV parser (no extra deps; column-header detection)
- Dedupe pipeline: groups shipments by normalized company name, upserts companies (domain-first match → name fallback), merges capability tags from HTS chapters, enqueues research/email_lookup/score jobs for new companies
- Apollo.io people-search client with title-priority scoring (Supply Chain > Sourcing > Procurement > Ops > Mfg > VP > Director > CEO)
- Hunter.io fallback client
- ImportYeti Playwright scraper (dev-machine only; site is auth-walled) plus paid API code path
- API routes: `/api/sources/upload`, `/api/sources/scrape`, `/api/sources/list`
- CLI: `scripts/scrape.ts --hts 8544 --since YYYY-MM-DD --max-pages N`

**Enrichment** (commit `feat(enrich)`)
- Shipments-summary helper → compact markdown for Claude
- Research worker (`claude-sonnet-4-6`) → research_summary + research_intelligence_json (typed) + capability_match + tariff_exposure_score
- Score worker (`claude-haiku-4-5`) → fit_score 0-100; promotes researching → qualified at ≥60
- Draft worker (`claude-sonnet-4-6`) → personalized cold email using template as a frame; optionally persists as queued sends row
- Reply classifier (`claude-haiku-4-5`) → interested / not_now / not_a_fit / unsubscribe / auto_oof / unknown
- Router that dispatches enrichment_jobs rows to handlers
- Cron routes: `/api/cron/run-enrichment` (batched dequeue+dispatch), `/api/cron/enqueue-enrichment` (scanner for missing research/contacts), `/api/cron/score-leads` (nightly re-score for stale leads)

**Outreach** (commit `feat(outreach)`)
- Merge-tag renderer (`{{contact.first_name}}`, `{{company.name}}`, `{{shipments.top_*}}` + fallbacks)
- HMAC-signed unsubscribe tokens (`/u/[token]`)
- Postal-address + unsubscribe link footer added on every send
- Suppression list (email + domain) — checked before every send; hard bounces + spam complaints auto-suppress
- Daily cap (UTC day boundary) gates send-batch
- Send pipeline through Resend + status transitions (queued → sent → opened/clicked/bounced/replied)
- Resend webhook handler with Svix-style signature verification (handles sent/delivered/opened/clicked/bounced/complained/replied; replies enqueue classify_reply)
- Daily digest HTML compositor (replies + top 10 hot leads + 24h stats) → emailed to DIGEST_RECIPIENT
- 8 seed templates (4 buckets × 2 variants: cold_intro + tariff_angle)
- Campaign launcher: materializes segment filter → draft_email jobs

**UI** (commit `feat(ui)`)
- Dashboard: 4 stat cards, area chart (pipeline by week), bar chart (by stage), donut (by industry), top-10 hot leads table
- /leads: filter rail (capability, status, min fit, has-email, q) + table with score chips
- /leads/[id]: tabs (overview/research/contacts/shipments/emails/activity), research-intelligence panel (6 cards + accent-amber opening hook + switching triggers + risk flags), activity timeline, sticky action rail (run enrichment, draft email, add note, add to campaign)
- /campaigns: list with reply-rate stats; /campaigns/new single-page wizard with confirm dialog; /campaigns/[id] detail
- /templates: grouped by bucket; /templates/[id] editor with merge-tag chip insertion + live preview
- /composer: lead → contact → template picker → Claude draft → edit → send via Resend or open in mail client
- /sources: scrape form (HTS dropdown) + drag-drop CSV upload + last 30 days panel
- /settings: env-key inventory across 6 groups (database, AI, email, enrichment, scraper, ops) with set/missing badges; SPF/DKIM/DMARC placeholder; team list

**Deploy** (this commit)
- `vercel.json` with the 6 cron schedules from the spec
- `scripts/seed.ts` (drops the 8 templates + 1 sample draft campaign)
- BUILD_LOG.md + run book in README

## What's stubbed or skipped

1. **ImportYeti auto-scrape on Vercel** (`/api/cron/scrape-importyeti`) returns "not implemented". Playwright on Vercel is finicky and the site is auth-walled. Two paths to fix: (a) wire the paid API in `lib/ingest/importyeti.ts:fetchViaApi` once you have credentials, or (b) run the scraper from a Fly.io machine that POSTs into `/api/sources/upload`. The CSV upload path is what you'll use day 1.
2. **Supabase types** in `lib/types/database.ts` are a permissive placeholder. Once the project exists, run `pnpm dlx supabase gen types typescript --project-id <ref> > lib/types/database.ts` to get strongly-typed rows everywhere. This will catch a couple of `as never` casts that are currently hand-rolled.
3. **SPF/DKIM/DMARC live check** on `/settings` is a placeholder. Resend's API exposes domain DNS status — wire it in after deployment.
4. **TanStack Table** is installed but the leads list uses a simple server-rendered table. Swap in TanStack Table when you want column sorting + pagination in the browser.
5. **Bulk actions** on /leads (assign to campaign, mark disqualified, export CSV) are surfaced as buttons but not yet wired to handlers.
6. **/composer** queues sends rather than calling Resend inline. The next `send-batch` cron tick (or a manual hit on the endpoint) is what actually sends.
7. **Sample address** in the email footer (`1234 N Stone Ave, Tucson AZ`) is a placeholder. Update it in `lib/outreach/render.ts:POSTAL_ADDRESS` with the real address before launching.

## Known gaps before go-live

| Item | Owner | Notes |
|---|---|---|
| Create Supabase project | You | Project URL + service-role key go in `.env.local` |
| Run migration | You | `pnpm dlx supabase db push --db-url postgresql://…` or via the dashboard SQL editor |
| Set ANTHROPIC_API_KEY | You | Enrichment is no-op without it |
| Set RESEND_API_KEY + verified domain | You | Sender domain must pass SPF/DKIM/DMARC before launching |
| Set CRON_SECRET in Vercel | You | Same value in `.env.local` for local testing |
| Wire Resend webhook | You | Resend dashboard → Webhooks → URL: `<vercel-url>/api/webhooks/resend`, sign-with-secret = `RESEND_WEBHOOK_SECRET` |
| Apollo or Hunter key | You | At least one — otherwise contact enrichment is blocked |
| Replace logo SVG | You | `/public/micromex-logo.svg` is a placeholder mark |
| Replace postal address | You | `lib/outreach/render.ts` — CAN-SPAM requires real address |

## File count

- Migrations: 1 (`0001_init.sql`)
- Lib files: 24
- Components: 22
- Pages: 13
- API routes: 18
- Scripts: 2

Total ~80 source files + the seed templates.
