import { Badge } from '@/components/ui/badge';
import { CAPABILITY_SHORT, type CapabilityBucket } from '@/lib/types/domain';

export function CapabilityBadge({ bucket }: { bucket: CapabilityBucket }) {
  return <Badge variant={bucket}>{CAPABILITY_SHORT[bucket]}</Badge>;
}

export function CapabilityList({ buckets }: { buckets: CapabilityBucket[] | null | undefined }) {
  if (!buckets || buckets.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {buckets.map((b) => (
        <CapabilityBadge key={b} bucket={b} />
      ))}
    </div>
  );
}
