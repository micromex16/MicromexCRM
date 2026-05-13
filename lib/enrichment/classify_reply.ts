import { anthropic, CLAUDE_MODELS, extractJson, textFrom } from '@/lib/anthropic';
import { createServiceClient } from '@/lib/supabase/server';

export type ReplyClassification =
  | 'interested'
  | 'not_now'
  | 'not_a_fit'
  | 'unsubscribe'
  | 'auto_oof'
  | 'unknown';

export async function classifyReply(sendId: string): Promise<ReplyClassification> {
  const supabase = createServiceClient();
  const { data: send, error } = await supabase
    .from('sends')
    .select('id, reply_body, company_id')
    .eq('id', sendId)
    .single();
  if (error || !send) throw new Error(`classifyReply: send ${sendId} not found`);
  const s = send as { id: string; reply_body: string | null; company_id: string };
  if (!s.reply_body) throw new Error('classifyReply: send has no reply_body');

  const client = anthropic();
  const msg = await client.messages.create({
    model: CLAUDE_MODELS.classify,
    max_tokens: 200,
    temperature: 0,
    messages: [{ role: 'user', content: CLASSIFY_PROMPT.replace('{{reply}}', s.reply_body) }],
  });

  const text = textFrom(msg);
  let parsed: { classification: ReplyClassification };
  try {
    parsed = extractJson(text);
  } catch {
    parsed = { classification: 'unknown' };
  }

  const allowed: ReplyClassification[] = [
    'interested',
    'not_now',
    'not_a_fit',
    'unsubscribe',
    'auto_oof',
    'unknown',
  ];
  const cls = allowed.includes(parsed.classification) ? parsed.classification : 'unknown';

  await supabase.from('sends').update({ reply_classification: cls } as never).eq('id', sendId);

  return cls;
}

const CLASSIFY_PROMPT = `Classify the following email reply into ONE of these categories:
  - "interested": positive engagement, asking questions, wants a call/info
  - "not_now": polite deferral, "circle back later", "Q3", "next year"
  - "not_a_fit": clear no, "we don't do that", wrong contact, "remove me"
  - "unsubscribe": explicit unsubscribe / opt-out request
  - "auto_oof": out-of-office autoresponder
  - "unknown": cannot determine

Reply text:
"""
{{reply}}
"""

Output strict JSON: { "classification": "<one of above>" }`;
