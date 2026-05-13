import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { scrapeImportYeti } from '@/lib/ingest/importyeti';
import { ingestShipments } from '@/lib/ingest/dedupe';

export const runtime = 'nodejs';
export const maxDuration = 300; // up to 5 min for a small scrape

const Body = z.object({
  hts_code: z.string().min(2),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  max_pages: z.number().int().positive().max(20).default(3),
  country: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await request.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const shipments = await scrapeImportYeti({
      htsCode: parsed.data.hts_code,
      since: parsed.data.since,
      maxPages: parsed.data.max_pages,
      country: parsed.data.country,
    });

    const result = await ingestShipments(shipments, 'importyeti');
    return NextResponse.json({ ok: true, fetched: shipments.length, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
