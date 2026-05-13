# Micromex Lead Engine

Outbound lead engine for Micromex — USMCA contract manufacturer (Tucson + Imuris, Sonora, est. 1988).

Spots US brands importing from China/Vietnam/Taiwan via customs data, enriches them with Claude-powered research, and runs capability-targeted outreach across four service lines: **Electrical**, **Refurb**, **Packaging**, **Mechanical**.

## Stack

- **Frontend & API:** Next.js 14 (app router), TypeScript, Tailwind, shadcn/ui
- **DB / auth:** Supabase (Postgres + RLS)
- **AI:** Anthropic Claude (`claude-sonnet-4-6` for research, `claude-haiku-4-5` for bulk classify)
- **Email:** Resend (transactional, DKIM/SPF required)
- **Contact enrichment:** Apollo.io (primary), Hunter.io (fallback)
- **Scraping:** Playwright (ImportYeti)
- **Hosting:** Vercel (Next.js + cron)

## Quick start

```bash
cp .env.example .env.local      # fill in secrets
pnpm install
pnpm db:start                    # local Supabase (needs Docker) — optional
pnpm db:reset                    # apply migrations
pnpm dev
```

Then open http://localhost:3000 and sign in with your `@micromex.com` email (magic link).

## Layout

```
app/
  (app)/              protected routes — sidebar shell
  login/              magic-link sign-in
  auth/               callback + signout
  api/
    cron/             vercel cron endpoints
    webhooks/         resend webhook
components/
  ui/                 shadcn primitives
  layout/             sidebar, topbar, app shell
lib/
  supabase/           client, server, service-role, middleware
  types/              database (gen) + domain (hand-maintained)
  anthropic.ts        claude client
  resend.ts           resend client
  jobs.ts             enrichment queue helpers
  cron.ts             cron auth helper
supabase/
  migrations/         0001_init.sql — full schema
scripts/
  seed.ts             seed templates + sample campaign
  scrape.ts           manual ImportYeti scrape
```

## Build status

This README is a stub — Agent 6 expands it as the final step. See `BUILD_LOG.md` for what each agent built.

## Operations

Cron schedule lives in `vercel.json`. See `docs/operations.md`.

Daily send caps start at 50/day and step up. SPF/DKIM/DMARC must pass before campaigns can launch — `/settings` gates this.
