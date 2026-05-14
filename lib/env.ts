import { z } from 'zod';

// Server-side env. Do NOT import this from client components.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  ALLOWED_EMAIL_DOMAIN: z.string().default('micromex.com'),

  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_RESEARCH_MODEL: z.string().default('claude-sonnet-4-6'),
  CLAUDE_CLASSIFY_MODEL: z.string().default('claude-haiku-4-5'),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_FROM_NAME: z.string().optional(),
  RESEND_REPLY_TO: z.string().email().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),

  APOLLO_API_KEY: z.string().optional(),
  HUNTER_API_KEY: z.string().optional(),

  IMPORTYETI_API_KEY: z.string().optional(),
  IMPORTYETI_USERNAME: z.string().optional(),
  IMPORTYETI_PASSWORD: z.string().optional(),

  CRON_SECRET: z.string().optional(),

  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  DIGEST_RECIPIENT: z.string().email().optional(),

  DAILY_SEND_CAP: z.coerce.number().int().positive().default(50),
  ENRICHMENT_BATCH_SIZE: z.coerce.number().int().positive().default(10),

  // Email signature (appended to every outbound send)
  SIGNATURE_TITLE: z.string().default('President'),
  SIGNATURE_LINKEDIN: z.string().default('https://www.linkedin.com/in/giovannigarcin/'),
  SIGNATURE_WEBSITE: z.string().default('https://micromex.com'),
  SIGNATURE_COMPANY: z.string().default('Micromex'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  cached = parsed.data;
  return cached;
}

// Client-safe public env
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
};
