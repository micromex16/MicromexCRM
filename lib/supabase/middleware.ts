import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { domainFromEmail } from '@/lib/utils';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/signout'];
const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? 'micromex.com';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const isApi = path.startsWith('/api/');
  const isCron = path.startsWith('/api/cron/');
  const isWebhook = path.startsWith('/api/webhooks/');

  // Cron / webhook routes are auth-gated by their own secret, not session.
  if (isCron || isWebhook) return response;

  if (!user && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Domain gate
  if (user) {
    const d = domainFromEmail(user.email);
    if (d && d !== ALLOWED_DOMAIN.toLowerCase() && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'domain');
      // sign out
      await supabase.auth.signOut();
      return NextResponse.redirect(url);
    }
  }

  return response;
}
