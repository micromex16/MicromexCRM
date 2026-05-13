'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function CsvUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  async function uploadFile(f: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/sources/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`Uploaded ${json.shipments_inserted ?? 0} shipments`, {
        description: `${json.companies_created ?? 0} new companies · ${json.jobs_enqueued ?? 0} enrichment jobs queued`,
      });
      setFile(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onSelect(f: File | null) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      toast.error('Please upload a .csv file');
      return;
    }
    setFile(f);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload CSV</CardTitle>
        <CardDescription>
          Export from ImportYeti (or Panjiva) → drag the CSV here. Standard column headers are
          auto-detected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onSelect(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
            dragging ? 'border-mx-500 bg-mx-50' : 'border-border hover:bg-muted/50',
          )}
        >
          {file ? <FileText className="h-6 w-6 text-mx-500" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
          {file ? (
            <p className="text-sm font-medium">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium">Drop CSV here or click to browse</p>
              <p className="text-xs text-muted-foreground">
                Expected columns: Consignee Name, Shipper Country, HS Code, Product Description, Arrival Date, Bill of Lading
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
          />
        </div>

        {file && (
          <div className="flex gap-2">
            <Button
              onClick={() => uploadFile(file)}
              disabled={uploading}
              className="flex-1"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Import {file.name}
                </>
              )}
            </Button>
            <Button variant="ghost" onClick={() => setFile(null)} disabled={uploading}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
