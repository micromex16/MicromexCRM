import { createServiceClient } from '@/lib/supabase/server';
import { capabilityFromHts, extractDomain, normalizeCompanyName } from '@/lib/ingest/normalize';
import { enqueue } from '@/lib/jobs';

export interface RawShipment {
  consignee_name_raw: string;
  consignee_address: string | null;
  shipper_name: string | null;
  shipper_country: string | null;
  shipper_address: string | null;
  product_description: string | null;
  hts_code: string | null;
  weight_kg: number | null;
  container_count: number | null;
  arrival_date: string | null;
  port_of_unlading: string | null;
  port_of_lading: string | null;
  vessel_name: string | null;
  bill_of_lading: string | null;
}

export interface IngestResult {
  shipments_inserted: number;
  shipments_skipped: number;
  companies_created: number;
  companies_updated: number;
  jobs_enqueued: number;
  errors: string[];
}

/**
 * Bulk-insert shipments and upsert companies, then enqueue enrichment.
 * Service-role only (bypasses RLS).
 */
export async function ingestShipments(
  shipments: RawShipment[],
  source: 'importyeti' | 'csv_upload',
): Promise<IngestResult> {
  const supabase = createServiceClient();
  const result: IngestResult = {
    shipments_inserted: 0,
    shipments_skipped: 0,
    companies_created: 0,
    companies_updated: 0,
    jobs_enqueued: 0,
    errors: [],
  };

  // Group shipments by normalized company name (dedupe key).
  const byCompany = new Map<string, RawShipment[]>();
  for (const s of shipments) {
    if (!s.consignee_name_raw) {
      result.shipments_skipped++;
      continue;
    }
    const key = normalizeCompanyName(s.consignee_name_raw);
    if (!key) {
      result.shipments_skipped++;
      continue;
    }
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(s);
  }

  for (const [key, group] of byCompany) {
    // Pick a "best" name (longest) and try to derive a domain from any address fields.
    const bestName = group.reduce(
      (a, b) => (b.consignee_name_raw.length > a.length ? b.consignee_name_raw : a),
      group[0].consignee_name_raw,
    );
    const domain = group.map((g) => extractDomain(g.consignee_address)).find(Boolean) ?? null;
    const capabilities = new Set<string>();
    for (const g of group) {
      const cap = capabilityFromHts(g.hts_code);
      if (cap) capabilities.add(cap);
    }
    const capabilityArray = Array.from(capabilities);

    // Upsert company. Prefer matching by domain if we have one; else by normalized name (we don't have a unique
    // name index so do a select-then-insert/update).
    let companyId: string | null = null;
    let companyExisted = false;

    if (domain) {
      const { data: existing } = await supabase
        .from('companies')
        .select('id, capability_match')
        .eq('domain', domain)
        .maybeSingle();
      if (existing) {
        companyId = (existing as { id: string }).id;
        companyExisted = true;
        const merged = mergeCapabilities(
          (existing as { capability_match?: string[] }).capability_match ?? [],
          capabilityArray,
        );
        await supabase
          .from('companies')
          .update({ capability_match: merged as never, last_activity_at: new Date().toISOString() } as never)
          .eq('id', companyId);
      }
    }

    if (!companyId) {
      const { data: existingByName } = await supabase
        .from('companies')
        .select('id, capability_match')
        .ilike('name', bestName)
        .maybeSingle();
      if (existingByName) {
        companyId = (existingByName as { id: string }).id;
        companyExisted = true;
        const merged = mergeCapabilities(
          (existingByName as { capability_match?: string[] }).capability_match ?? [],
          capabilityArray,
        );
        await supabase
          .from('companies')
          .update({ capability_match: merged as never, last_activity_at: new Date().toISOString() } as never)
          .eq('id', companyId);
      }
    }

    if (!companyId) {
      const { data: inserted, error } = await supabase
        .from('companies')
        .insert({
          name: bestName,
          domain,
          country: 'US',
          capability_match: capabilityArray as never,
          source,
          source_ref: group[0].bill_of_lading,
          status: 'new',
          last_activity_at: new Date().toISOString(),
        } as never)
        .select('id')
        .single();
      if (error || !inserted) {
        result.errors.push(`insert company ${bestName}: ${error?.message ?? 'unknown'}`);
        continue;
      }
      companyId = (inserted as { id: string }).id;
      result.companies_created++;
    } else if (companyExisted) {
      result.companies_updated++;
    }

    // Insert shipments for this company. Skip BOL duplicates via unique index.
    const rows = group.map((g) => ({ ...g, company_id: companyId, source }));
    const { error: shipErr, count } = await supabase
      .from('shipments')
      .upsert(rows as never, { onConflict: 'bill_of_lading', ignoreDuplicates: true, count: 'exact' });
    if (shipErr) {
      result.errors.push(`insert shipments for ${bestName}: ${shipErr.message}`);
      continue;
    }
    result.shipments_inserted += count ?? rows.length;

    // Enqueue jobs for new companies only.
    if (!companyExisted) {
      try {
        await enqueue({ targetType: 'company', targetId: companyId, jobType: 'research', priority: 7 });
        await enqueue({ targetType: 'company', targetId: companyId, jobType: 'email_lookup', priority: 6 });
        await enqueue({ targetType: 'company', targetId: companyId, jobType: 'score', priority: 4 });
        result.jobs_enqueued += 3;
      } catch (e) {
        result.errors.push(`enqueue for ${bestName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return result;
}

function mergeCapabilities(existing: string[], incoming: string[]): string[] {
  const set = new Set([...existing, ...incoming]);
  return Array.from(set);
}
