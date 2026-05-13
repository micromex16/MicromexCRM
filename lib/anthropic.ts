import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (_client) return _client;
  const e = env();
  if (!e.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required to call Claude');
  }
  _client = new Anthropic({ apiKey: e.ANTHROPIC_API_KEY });
  return _client;
}

export const CLAUDE_MODELS = {
  research: 'claude-sonnet-4-6' as const,
  classify: 'claude-haiku-4-5' as const,
};

/**
 * Helper that extracts a single text block from a Claude response.
 */
export function textFrom(msg: Anthropic.Messages.Message): string {
  for (const block of msg.content) {
    if (block.type === 'text') return block.text;
  }
  return '';
}

/**
 * Helper that pulls the first ```json ... ``` block (or raw JSON) from a string.
 */
export function extractJson<T = unknown>(s: string): T {
  // Try fenced block first
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence?.[1] ?? s).trim();
  // Strip any leading prose before the first {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON object found in Claude response');
  }
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
