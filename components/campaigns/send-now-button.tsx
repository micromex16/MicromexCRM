'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function SendNowButton({ sendId }: { sendId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sends/${sendId}/send-now`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.status === 'sent') {
        toast.success('Sent ✉');
      } else if (json.status === 'skipped_suppressed') {
        toast.error('Skipped — contact is on the suppression list');
      } else {
        toast.error('Send failed', { description: json.error ?? 'unknown' });
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={go} disabled={busy}>
      {busy ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Sending…
        </>
      ) : (
        <>
          <Send className="h-3 w-3" /> Send now
        </>
      )}
    </Button>
  );
}
