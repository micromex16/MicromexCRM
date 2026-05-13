import { createServiceClient } from '@/lib/supabase/server';

export interface ShipmentSummary {
  total_count: number;
  date_range: { from: string; to: string } | null;
  top_hts: { code: string; count: number; capability: string | null }[];
  top_origin_countries: { country: string; count: number }[];
  top_shippers: { name: string; count: number }[];
  sample_products: string[];
  markdown: string;
}

/**
 * Build a compact shipment summary for Claude — top HTS chapters, origin
 * countries, recent product descriptions, and a date range. Keep it under
 * ~1500 tokens of markdown.
 */
export async function buildShipmentSummary(companyId: string): Promise<ShipmentSummary> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('shipments')
    .select(
      'hts_code, shipper_country, shipper_name, product_description, arrival_date, weight_kg, container_count',
    )
    .eq('company_id', companyId)
    .order('arrival_date', { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Array<{
    hts_code: string | null;
    shipper_country: string | null;
    shipper_name: string | null;
    product_description: string | null;
    arrival_date: string | null;
    weight_kg: number | null;
    container_count: number | null;
  }>;

  const htsCount = new Map<string, number>();
  const countryCount = new Map<string, number>();
  const shipperCount = new Map<string, number>();
  const products = new Set<string>();
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const r of rows) {
    if (r.hts_code) htsCount.set(r.hts_code, (htsCount.get(r.hts_code) ?? 0) + 1);
    if (r.shipper_country)
      countryCount.set(r.shipper_country, (countryCount.get(r.shipper_country) ?? 0) + 1);
    if (r.shipper_name)
      shipperCount.set(r.shipper_name, (shipperCount.get(r.shipper_name) ?? 0) + 1);
    if (r.product_description) products.add(r.product_description.slice(0, 120));
    if (r.arrival_date) {
      if (!minDate || r.arrival_date < minDate) minDate = r.arrival_date;
      if (!maxDate || r.arrival_date > maxDate) maxDate = r.arrival_date;
    }
  }

  const top_hts = sortMap(htsCount, 5).map(([code, count]) => ({
    code,
    count,
    capability: htsCapability(code),
  }));
  const top_origin_countries = sortMap(countryCount, 5).map(([country, count]) => ({
    country,
    count,
  }));
  const top_shippers = sortMap(shipperCount, 5).map(([name, count]) => ({ name, count }));
  const sample_products = Array.from(products).slice(0, 8);

  const md = renderMarkdown({
    rows: rows.length,
    minDate,
    maxDate,
    top_hts,
    top_origin_countries,
    top_shippers,
    sample_products,
  });

  return {
    total_count: rows.length,
    date_range: minDate && maxDate ? { from: minDate, to: maxDate } : null,
    top_hts,
    top_origin_countries,
    top_shippers,
    sample_products,
    markdown: md,
  };
}

function sortMap<K>(m: Map<K, number>, n: number): [K, number][] {
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function htsCapability(code: string): string | null {
  const c = code.slice(0, 4);
  if (['8544', '8504', '8536', '8537'].includes(c)) return 'electrical';
  if (['7326', '8302'].includes(c)) return 'mechanical';
  if (['8516'].includes(c)) return 'refurb';
  if (['9503', '4911', '3919'].includes(c)) return 'packaging';
  return null;
}

function renderMarkdown(s: {
  rows: number;
  minDate: string | null;
  maxDate: string | null;
  top_hts: { code: string; count: number; capability: string | null }[];
  top_origin_countries: { country: string; count: number }[];
  top_shippers: { name: string; count: number }[];
  sample_products: string[];
}): string {
  if (s.rows === 0) return '(no shipments on record)';
  const lines: string[] = [];
  lines.push(`Total shipments: ${s.rows}`);
  if (s.minDate && s.maxDate) lines.push(`Date range: ${s.minDate} → ${s.maxDate}`);
  if (s.top_hts.length) {
    lines.push('');
    lines.push('Top HTS chapters:');
    for (const h of s.top_hts) {
      lines.push(`  - ${h.code} (×${h.count}${h.capability ? `, ${h.capability}` : ''})`);
    }
  }
  if (s.top_origin_countries.length) {
    lines.push('');
    lines.push('Top origin countries:');
    for (const c of s.top_origin_countries) lines.push(`  - ${c.country} (×${c.count})`);
  }
  if (s.top_shippers.length) {
    lines.push('');
    lines.push('Top shippers (foreign suppliers):');
    for (const s2 of s.top_shippers) lines.push(`  - ${s2.name} (×${s2.count})`);
  }
  if (s.sample_products.length) {
    lines.push('');
    lines.push('Sample product descriptions:');
    for (const p of s.sample_products) lines.push(`  - ${p}`);
  }
  return lines.join('\n');
}
