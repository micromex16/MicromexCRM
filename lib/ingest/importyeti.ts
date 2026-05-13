// ImportYeti scraper — Playwright-based.
//
// IMPORTANT: ImportYeti is auth-walled and rate-limits aggressively. Their
// Terms of Service may prohibit automated scraping. Use the CSV-upload path
// as the primary workflow; the scraper is for low-volume, supervised runs
// from the CLI script (`scripts/scrape.ts`) on a developer machine, not on
// Vercel.
//
// If `IMPORTYETI_API_KEY` is set, we prefer the official paid API path
// (stub — fill in once you have docs/keys).

import type { RawShipment } from '@/lib/ingest/dedupe';

export interface ScrapeOptions {
  htsCode: string;
  since: string; // ISO date
  maxPages?: number;
  country?: string; // origin country filter, e.g. "China"
}

export async function scrapeImportYeti(opts: ScrapeOptions): Promise<RawShipment[]> {
  if (process.env.IMPORTYETI_API_KEY) {
    return await fetchViaApi(opts);
  }
  return await scrapeViaPlaywright(opts);
}

// ---------------------------------------------------------------------------
// Paid API path (placeholder — update once API contract is known).
// ---------------------------------------------------------------------------
async function fetchViaApi(opts: ScrapeOptions): Promise<RawShipment[]> {
  const key = process.env.IMPORTYETI_API_KEY!;
  // ImportYeti's commercial API endpoints are not public; this is a placeholder
  // for whatever contract you negotiate. Throw a clear error if called blind.
  throw new Error(
    `ImportYeti API path not yet implemented. Got opts=${JSON.stringify(opts)}, key=${key.slice(0, 4)}…. Fill in lib/ingest/importyeti.ts:fetchViaApi when you have credentials.`,
  );
}

// ---------------------------------------------------------------------------
// Playwright path. Only works on a developer machine with login credentials.
// ---------------------------------------------------------------------------
async function scrapeViaPlaywright(opts: ScrapeOptions): Promise<RawShipment[]> {
  const user = process.env.IMPORTYETI_USERNAME;
  const pass = process.env.IMPORTYETI_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      'ImportYeti scraper requires IMPORTYETI_USERNAME and IMPORTYETI_PASSWORD env vars, OR use the CSV-upload path at /sources.',
    );
  }

  // Import playwright-core lazily so build-time bundling doesn't choke.
  const { chromium } = await import('playwright-core');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  const page = await ctx.newPage();

  try {
    // Login
    await page.goto('https://www.importyeti.com/login', { waitUntil: 'networkidle' });
    await page.fill('input[name="email"], input[type="email"]', user);
    await page.fill('input[name="password"], input[type="password"]', pass);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForLoadState('networkidle'),
    ]);

    // Search by HTS chapter and date range
    const url = new URL('https://www.importyeti.com/search');
    url.searchParams.set('productdescription', opts.htsCode);
    if (opts.country) url.searchParams.set('shippercountry', opts.country);
    if (opts.since) url.searchParams.set('mindate', opts.since);

    const shipments: RawShipment[] = [];
    const maxPages = opts.maxPages ?? 3;

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      url.searchParams.set('page', String(pageNo));
      await page.goto(url.toString(), { waitUntil: 'networkidle' });

      // ImportYeti's DOM structure shifts; this is a defensive extraction.
      const rows = await page.evaluate(() => {
        const out: Record<string, string | null>[] = [];
        const cards = document.querySelectorAll('[data-bol], .shipment-card, tr.shipment-row');
        cards.forEach((c) => {
          const text = (sel: string) => c.querySelector(sel)?.textContent?.trim() ?? null;
          out.push({
            consignee: text('.consignee, [data-consignee]'),
            consigneeAddr: text('.consignee-address, [data-consignee-address]'),
            shipper: text('.shipper, [data-shipper]'),
            shipperCountry: text('.shipper-country, [data-shipper-country]'),
            product: text('.product, [data-product]'),
            hts: text('.hts, [data-hts]'),
            weight: text('.weight, [data-weight]'),
            arrival: text('.arrival, [data-arrival]'),
            port: text('.port, [data-port]'),
            bol: text('.bol, [data-bol]'),
          });
        });
        return out;
      });

      for (const r of rows) {
        if (!r.consignee) continue;
        shipments.push({
          consignee_name_raw: r.consignee,
          consignee_address: r.consigneeAddr,
          shipper_name: r.shipper,
          shipper_country: r.shipperCountry,
          shipper_address: null,
          product_description: r.product,
          hts_code: r.hts ? r.hts.replace(/[^0-9]/g, '').slice(0, 4) : opts.htsCode,
          weight_kg: r.weight ? Number(r.weight.replace(/[^0-9.]/g, '')) || null : null,
          container_count: null,
          arrival_date: r.arrival
            ? new Date(r.arrival).toISOString().slice(0, 10)
            : null,
          port_of_unlading: r.port,
          port_of_lading: null,
          vessel_name: null,
          bill_of_lading: r.bol,
        });
      }

      if (rows.length === 0) break; // no more results
    }

    return shipments;
  } finally {
    await ctx.close();
    await browser.close();
  }
}
