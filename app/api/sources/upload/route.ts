import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapShipmentRow, parseCsv } from '@/lib/ingest/csv';
import { ingestShipments, type RawShipment } from '@/lib/ingest/dedupe';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }

  const text = await file.text();
  const { rows } = parseCsv(text);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'CSV is empty or unparseable' }, { status: 400 });
  }

  const shipments: RawShipment[] = rows.map(mapShipmentRow).filter((r) => r.consignee_name_raw);
  if (shipments.length === 0) {
    return NextResponse.json(
      { error: 'No valid shipment rows. Check the CSV has a Consignee Name column.' },
      { status: 400 },
    );
  }

  const result = await ingestShipments(shipments, 'csv_upload');
  return NextResponse.json({ ok: true, ...result });
}
