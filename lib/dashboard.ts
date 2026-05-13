// Server-side dashboard aggregations. Called from app/(app)/page.tsx.

import { createClient } from '@/lib/supabase/server';
import type { LeadStatus } from '@/lib/types/domain';

export interface DashboardStats {
  totalLeads: number;
  qualifiedLeads: number;
  totalSentWeek: number;
  totalRepliedWeek: number;
  replyRate: number;
  closedWon: number;
  winRate: number;
  pipelineEstimateUsd: number;
}

export interface DashboardData {
  stats: DashboardStats;
  pipelineByWeek: { week: string; sent: number; replied: number }[];
  byStage: { status: LeadStatus; count: number }[];
  byIndustry: { industry: string; count: number }[];
  hotLeads: {
    id: string;
    name: string;
    domain: string | null;
    industry_segment: string | null;
    fit_score: number | null;
    tariff_exposure_score: number | null;
    capability_match: string[] | null;
    status: LeadStatus;
  }[];
}

export async function loadDashboard(): Promise<DashboardData> {
  const supabase = createClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sinceWeeks = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString();

  const [companies, sendsRecent, sendsForChart, hot] = await Promise.all([
    supabase
      .from('companies')
      .select('id, status, industry_segment, fit_score, research_intelligence_json'),
    supabase
      .from('sends')
      .select('status, sent_at, replied_at')
      .gte('created_at', since),
    supabase
      .from('sends')
      .select('sent_at, replied_at')
      .gte('created_at', sinceWeeks),
    supabase.from('v_hot_leads').select('*').limit(10),
  ]);

  const all = (companies.data ?? []) as Array<{
    id: string;
    status: LeadStatus;
    industry_segment: string | null;
    fit_score: number | null;
    research_intelligence_json: { estimated_annual_spend_usd?: { low?: number; high?: number } } | null;
  }>;
  const recent = (sendsRecent.data ?? []) as Array<{ status: string; sent_at: string | null; replied_at: string | null }>;

  const totalLeads = all.length;
  const qualifiedLeads = all.filter((c) => c.status === 'qualified').length;
  const totalSentWeek = recent.filter((s) => s.sent_at).length;
  const totalRepliedWeek = recent.filter((s) => s.replied_at).length;
  const replyRate = totalSentWeek === 0 ? 0 : Math.round((totalRepliedWeek / totalSentWeek) * 100);
  const closedWon = all.filter((c) => c.status === 'closed_won').length;
  const closedLost = all.filter((c) => c.status === 'closed_lost').length;
  const winRate =
    closedWon + closedLost === 0 ? 0 : Math.round((closedWon / (closedWon + closedLost)) * 100);

  // Pipeline estimate = fit_score-weighted sum of midpoint annual spend, for non-closed leads.
  let pipelineEstimateUsd = 0;
  for (const c of all) {
    if (['closed_won', 'closed_lost', 'disqualified'].includes(c.status)) continue;
    const lo = c.research_intelligence_json?.estimated_annual_spend_usd?.low ?? 0;
    const hi = c.research_intelligence_json?.estimated_annual_spend_usd?.high ?? 0;
    const mid = (lo + hi) / 2;
    const weight = (c.fit_score ?? 0) / 100;
    pipelineEstimateUsd += mid * weight;
  }

  const byStage: { status: LeadStatus; count: number }[] = [];
  for (const c of all) {
    if (['closed_lost', 'disqualified'].includes(c.status)) continue;
    const existing = byStage.find((b) => b.status === c.status);
    if (existing) existing.count++;
    else byStage.push({ status: c.status, count: 1 });
  }

  const industryMap = new Map<string, number>();
  for (const c of all) {
    const i = c.industry_segment ?? 'Unspecified';
    industryMap.set(i, (industryMap.get(i) ?? 0) + 1);
  }
  const byIndustry = Array.from(industryMap.entries())
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Pipeline by week (last 12)
  const sendsForChartRows = (sendsForChart.data ?? []) as Array<{ sent_at: string | null; replied_at: string | null }>;
  const weekMap = new Map<string, { sent: number; replied: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
    const key = isoWeek(d);
    weekMap.set(key, { sent: 0, replied: 0 });
  }
  for (const s of sendsForChartRows) {
    if (s.sent_at) {
      const k = isoWeek(new Date(s.sent_at));
      const v = weekMap.get(k);
      if (v) v.sent++;
    }
    if (s.replied_at) {
      const k = isoWeek(new Date(s.replied_at));
      const v = weekMap.get(k);
      if (v) v.replied++;
    }
  }
  const pipelineByWeek = Array.from(weekMap.entries()).map(([week, v]) => ({ week, ...v }));

  const hotLeads = (hot.data ?? []) as DashboardData['hotLeads'];

  return {
    stats: {
      totalLeads,
      qualifiedLeads,
      totalSentWeek,
      totalRepliedWeek,
      replyRate,
      closedWon,
      winRate,
      pipelineEstimateUsd: Math.round(pipelineEstimateUsd),
    },
    pipelineByWeek,
    byStage,
    byIndustry,
    hotLeads,
  };
}

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear().toString().slice(2)}-W${String(week).padStart(2, '0')}`;
}
