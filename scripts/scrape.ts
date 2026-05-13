#!/usr/bin/env tsx
/* eslint-disable no-console */
// Manual ImportYeti scrape from the command line.
//
//   pnpm tsx scripts/scrape.ts --hts 8544 --since 2026-01-01 --max-pages 5 --country China

import { scrapeImportYeti } from '@/lib/ingest/importyeti';
import { ingestShipments } from '@/lib/ingest/dedupe';

function arg(name: string): string | undefined {
  const key = `--${name}`;
  const i = process.argv.indexOf(key);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const hts = arg('hts');
  const since = arg('since');
  if (!hts || !since) {
    console.error('Usage: scrape --hts <code> --since YYYY-MM-DD [--max-pages N] [--country C]');
    process.exit(1);
  }
  const maxPages = arg('max-pages') ? parseInt(arg('max-pages')!, 10) : 3;
  const country = arg('country');

  console.log(`Scraping ImportYeti: HTS ${hts}, since ${since}, max-pages ${maxPages}…`);
  const shipments = await scrapeImportYeti({ htsCode: hts, since, maxPages, country });
  console.log(`Fetched ${shipments.length} shipments. Ingesting…`);

  const result = await ingestShipments(shipments, 'importyeti');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
