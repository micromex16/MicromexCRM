// Tiny CSV parser — no external deps.
// Handles RFC 4180 basics: quoted fields, escaped quotes, CRLF/LF, BOM.

export type CsvRow = Record<string, string>;

export function parseCsv(input: string): { headers: string[]; rows: CsvRow[] } {
  // Strip BOM
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\r') {
        // peek for \n
        if (input[i + 1] === '\n') i++;
        row.push(field);
        records.push(row);
        row = [];
        field = '';
      } else if (c === '\n') {
        row.push(field);
        records.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  // Flush last field
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  // Drop trailing empty rows
  while (records.length > 0 && records[records.length - 1].every((c) => c === '')) {
    records.pop();
  }

  const headers = records.shift() ?? [];
  const norm = headers.map((h) => h.trim());
  const rows: CsvRow[] = records.map((r) => {
    const obj: CsvRow = {};
    for (let i = 0; i < norm.length; i++) {
      obj[norm[i]] = (r[i] ?? '').trim();
    }
    return obj;
  });
  return { headers: norm, rows };
}

/**
 * Map CSV row → normalized shipment fields. Handles common ImportYeti/Panjiva
 * header variants.
 */
export function mapShipmentRow(row: CsvRow) {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(row).find((rk) => rk.toLowerCase() === k.toLowerCase());
      if (found && row[found]) return row[found];
    }
    return null;
  };

  const arrivalRaw = pick('Arrival Date', 'arrivalDate', 'Date');
  let arrival_date: string | null = null;
  if (arrivalRaw) {
    const d = new Date(arrivalRaw);
    if (!Number.isNaN(d.getTime())) arrival_date = d.toISOString().slice(0, 10);
  }

  const weightRaw = pick('Weight (kg)', 'Weight Kg', 'Weight', 'weight_kg');
  const weight_kg = weightRaw ? Number(weightRaw.replace(/[^0-9.]/g, '')) || null : null;

  const containersRaw = pick('Containers', 'Container Count', 'TEU', 'containers');
  const container_count = containersRaw ? parseInt(containersRaw, 10) || null : null;

  return {
    consignee_name_raw: pick('Consignee Name', 'Consignee', 'consignee') ?? '',
    consignee_address: pick('Consignee Address', 'consigneeAddress') ?? null,
    shipper_name: pick('Shipper Name', 'Shipper', 'shipper') ?? null,
    shipper_country: pick('Shipper Country', 'Origin Country', 'shipperCountry') ?? null,
    shipper_address: pick('Shipper Address', 'shipperAddress') ?? null,
    product_description: pick('Product Description', 'Product', 'Goods Description', 'description') ?? null,
    hts_code: normalizeHts(pick('HS Code', 'HTS Code', 'HSCode', 'hsCode')),
    weight_kg,
    container_count,
    arrival_date,
    port_of_unlading: pick('Port of Unlading', 'Port of Discharge', 'unladingPort') ?? null,
    port_of_lading: pick('Port of Lading', 'Port of Loading', 'ladingPort') ?? null,
    vessel_name: pick('Vessel Name', 'Vessel') ?? null,
    bill_of_lading: pick('Bill of Lading', 'BOL', 'B/L Number') ?? null,
  };
}

function normalizeHts(v: string | null): string | null {
  if (!v) return null;
  // Strip dots, take first 4 digits (chapter level)
  const digits = v.replace(/[^0-9]/g, '');
  if (digits.length < 2) return null;
  return digits.slice(0, 4);
}
