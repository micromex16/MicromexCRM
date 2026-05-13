// Auto-scrape on a 6-hour cadence. Currently a stub — ImportYeti scraping
// requires an authenticated browser session that's brittle on Vercel.
// In production: either run the scraper from a Fly.io worker that POSTs
// shipments into /api/sources/upload, or fill in the paid-API path in
// lib/ingest/importyeti.ts and uncomment the call below.

import { NextResponse, type NextRequest } from 'next/server';
import { assertCron } from '@/lib/cron';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = assertCron(request);
  if (auth) return auth;

  if (!process.env.IMPORTYETI_API_KEY) {
    return NextResponse.json({
      skipped: 'no_api_key',
      note: 'Set IMPORTYETI_API_KEY or run scripts/scrape.ts from a dev machine.',
    });
  }

  // TODO: wire to scrapeImportYeti once the paid API path is implemented.
  // const shipments = await scrapeImportYeti({ htsCode: '8544', since: '...', maxPages: 3 });
  // const result = await ingestShipments(shipments, 'importyeti');
  // return NextResponse.json(result);

  return NextResponse.json({ skipped: 'not_implemented' });
}
