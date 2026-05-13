'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface IndustrySlice {
  industry: string;
  count: number;
}

const COLORS = ['#1F5BA8', '#4A7DC0', '#789FD3', '#A9C3E5', '#F2A93B', '#103768'];

export function IndustryChart({ data }: { data: IndustrySlice[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        No industry data yet.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="industry"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #D6E4F3', fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
