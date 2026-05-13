import { anthropic, CLAUDE_MODELS, extractJson, textFrom } from '@/lib/anthropic';
import { createServiceClient } from '@/lib/supabase/server';
import { buildShipmentSummary } from '@/lib/enrichment/shipments-summary';
import { enqueue } from '@/lib/jobs';

// Auto-trigger lookalike at this fit-score threshold — drives the
// self-learning loop: winners spawn searches for more winners.
const LOOKALIKE_THRESHOLD = 75;

export interface ScoreResult {
  fit_score: number;
  rationale: string;
}

export async function runScore(companyId: string): Promise<ScoreResult> {
  const supabase = createServiceClient();
  const { data: company, error } = await supabase
    .from('companies')
    .select(
      'id, name, revenue_band, employee_band, research_intelligence_json, tariff_exposure_score, status, fit_score',
    )
    .eq('id', companyId)
    .single();
  if (error || !company) throw new Error(`runScore: company ${companyId} not found`);

  const c = company as {
    id: string;
    name: string;
    revenue_band: string | null;
    employee_band: string | null;
    research_intelligence_json: unknown;
    tariff_exposure_score: number | null;
    status: string;
    fit_score: number | null;
  };

  if (!c.research_intelligence_json) {
    throw new Error(`runScore: company ${c.name} has no research yet`);
  }

  const summary = await buildShipmentSummary(companyId);

  const userPrompt = SCORE_PROMPT
    .replace('{{research_intelligence_json}}', JSON.stringify(c.research_intelligence_json, null, 2))
    .replace('{{shipments_summary}}', summary.markdown)
    .replace('{{company.revenue_band}}', c.revenue_band ?? '(unknown)')
    .replace('{{company.employee_band}}', c.employee_band ?? '(unknown)');

  const client = anthropic();
  const msg = await client.messages.create({
    model: CLAUDE_MODELS.classify,
    max_tokens: 500,
    temperature: 0,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = textFrom(msg);
  const result = extractJson<ScoreResult>(text);
  const fit = Math.max(0, Math.min(100, Math.round(result.fit_score)));

  const newStatus = fit >= 60 && c.status === 'researching' ? 'qualified' : c.status;

  await supabase
    .from('companies')
    .update({ fit_score: fit, status: newStatus } as never)
    .eq('id', companyId);

  // Self-learning hook: if this lead crossed the lookalike threshold (and
  // wasn't already above it before), queue a lookalike discovery job so
  // the system pulls in more companies similar to this winner.
  const wasBelow = (c.fit_score ?? 0) < LOOKALIKE_THRESHOLD;
  if (wasBelow && fit >= LOOKALIKE_THRESHOLD) {
    try {
      await enqueue({
        targetType: 'company',
        targetId: companyId,
        jobType: 'lookalike_discovery',
        priority: 5,
      });
    } catch (e) {
      // Non-fatal: lookalike is opportunistic
      console.warn(`score: lookalike enqueue failed for ${companyId}:`, e instanceof Error ? e.message : String(e));
    }
  }

  return { fit_score: fit, rationale: result.rationale };
}

const SCORE_PROMPT = `Score this Micromex lead 0-100. Inputs: {{research_intelligence_json}},
{{shipments_summary}}, {{company.revenue_band}}, {{company.employee_band}}.

Score rubric:
  +25 strong capability match (electrical/refurb/packaging/mechanical)
  +20 active import from China/Vietnam/Taiwan in last 12 months
  +15 revenue $5M-$500M
  +10 buying committee titles identified
  +10 high tariff exposure (>15%)
  +10 estimated annual spend > $250k
  +10 decision cycle < 16 weeks

Output JSON: { "fit_score": <int>, "rationale": "<one sentence>" }`;
