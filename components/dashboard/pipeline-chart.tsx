'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface PipelineWeek {
  week: string; // YYYY-WW
  sent: number;
  replied: number;
}

export function PipelineChart({ data }: { data: PipelineWeek[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="g-sent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F5BA8" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#1F5BA8" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="g-replied" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F2A93B" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#F2A93B" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#789FD3' }} />
        <YAxis tick={{ fontSize: 11, fill: '#789FD3' }} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #D6E4F3', fontSize: 12 }}
          cursor={{ stroke: '#1F5BA8', strokeOpacity: 0.2 }}
        />
        <Area
          type="monotone"
          dataKey="sent"
          stroke="#1F5BA8"
          strokeWidth={2}
          fill="url(#g-sent)"
          name="Sent"
        />
        <Area
          type="monotone"
          dataKey="replied"
          stroke="#F2A93B"
          strokeWidth={2}
          fill="url(#g-replied)"
          name="Replied"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
