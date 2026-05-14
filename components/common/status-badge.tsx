import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, type LeadStatus } from '@/lib/types/domain';

const VARIANTS: Record<LeadStatus, 'default' | 'secondary' | 'muted' | 'success' | 'hot' | 'destructive'> = {
  new: 'muted',
  researching: 'secondary',
  qualified: 'hot',
  contacted: 'default',
  replied: 'success',
  meeting: 'success',
  quoted: 'hot',
  closed_won: 'success',
  closed_lost: 'destructive',
  disqualified: 'muted',
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}
