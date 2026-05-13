'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

function LoginForm() {
  const params = useSearchParams();
  const errorParam = params.get('error');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const supabase = createClient();
      const next = params.get('next') ?? '/';
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-mx-100 shadow-lg shadow-mx-900/5">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-center">
          <Image src="/micromex-logo.svg" alt="Micromex" width={200} height={48} priority />
        </div>
        <CardTitle className="text-center text-xl">Sign in</CardTitle>
        <CardDescription className="text-center">
          Micromex employees only. We&apos;ll email you a magic link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {errorParam === 'domain' && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            That email isn&apos;t on the @micromex.com domain. Use your work email.
          </div>
        )}
        {sent ? (
          <div className="rounded-md border border-mx-200 bg-mx-50 p-4 text-sm text-mx-800">
            Check <strong>{email}</strong> for your sign-in link.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@micromex.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={sending}
              />
            </div>
            <Button type="submit" className="w-full" disabled={sending}>
              {sending ? 'Sending…' : 'Email magic link'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="grid-bg flex min-h-screen items-center justify-center bg-mx-50/40 p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
      <footer className="fixed bottom-4 left-0 right-0 text-center text-xs text-mx-400">
        Micromex · Lead Engine · Est. 1988
      </footer>
    </main>
  );
}
