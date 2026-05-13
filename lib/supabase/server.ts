import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { Database } from '@/lib/types/database';

export function createClient() {
  const cookieStore = cookies();
  const e = env();
  return createServerClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component — middleware refreshes the session, ignore.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Ignore — see above.
        }
      },
    },
  });
}

/**
 * Service role client. Bypasses RLS. NEVER pass to a browser. Use only in:
 *   - API route handlers running server-side
 *   - Cron job handlers
 *   - Background workers
 */
export function createServiceClient() {
  const e = env();
  if (!e.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service-role operations');
  }
  return createServerClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: {
      get: () => undefined,
      set: () => {},
      remove: () => {},
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
