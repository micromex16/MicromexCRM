import { runResearch } from '@/lib/enrichment/research';
import { runScore } from '@/lib/enrichment/score';
import { draftEmail } from '@/lib/enrichment/draft';
import { classifyReply } from '@/lib/enrichment/classify_reply';
import { enrichContacts } from '@/lib/ingest/enrich-contacts';
import { runLookalike } from '@/lib/discovery/lookalike';

export interface JobRow {
  id: string;
  target_type: 'company' | 'contact';
  target_id: string;
  job_type:
    | 'research'
    | 'email_lookup'
    | 'score'
    | 'draft_email'
    | 'classify_reply'
    | 'lookalike_discovery';
  metadata_json: Record<string, unknown> | null;
  attempts: number;
}

/**
 * Dispatch a single job to its handler. Throws on failure (caller decides retry).
 */
export async function dispatch(job: JobRow): Promise<Record<string, unknown>> {
  switch (job.job_type) {
    case 'research': {
      const r = await runResearch(job.target_id);
      return { capability_match: r.intelligence.primary_capability_match };
    }
    case 'score': {
      const r = await runScore(job.target_id);
      return { fit_score: r.fit_score };
    }
    case 'email_lookup': {
      const r = await enrichContacts(job.target_id);
      return { contacts_added: r.count, source: r.source };
    }
    case 'draft_email': {
      const templateId = (job.metadata_json?.template_id as string | undefined) ?? '';
      const campaignId = job.metadata_json?.campaign_id as string | undefined;
      if (!templateId) throw new Error('draft_email job requires metadata.template_id');
      const r = await draftEmail({
        contactId: job.target_id,
        templateId,
        persist: true,
        campaignId,
      });
      return { send_id: r.send_id };
    }
    case 'classify_reply': {
      const r = await classifyReply(job.target_id);
      return { classification: r };
    }
    case 'lookalike_discovery': {
      const r = await runLookalike(job.target_id, { maxCandidates: 8 });
      return {
        target_id: r.target_id,
        candidates_returned: r.candidates_returned,
        companies_created: r.companies_created,
        run_id: r.run_id,
      };
    }
    default:
      throw new Error(`router: unknown job_type ${job.job_type}`);
  }
}
