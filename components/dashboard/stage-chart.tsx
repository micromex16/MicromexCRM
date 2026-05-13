'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { STATUS_LABELS, type LeadStatus } from '@/lib/types/domain';

export interface StageRow {
  status: LeadStatus;
  count: number;
}

export function StageChart({ data }: { data: StageRow[] }) {
  const rows = data.map((d) => ({ ...d, label: STATUS_LABELS[d.status] }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#789FD3' }} />
        <YAxis tick={{ fontSize: 11, fill: '#789FD3' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #D6E4F3', fontSize: 12 }}
          cursor={{ fill: '#EEF4FB' }}
        />
        <Bar dataKey="count" fill="#1F5BA8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
