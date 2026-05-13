'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const errorParam = params.get('error');
  const next = params.get('next') ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(next);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-mx-100 shadow-lg shadow-mx-900/5">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-center">
          <Image src="/micromex-logo.svg" alt="Micromex" width={200} height={48} priority />
        </div>
        <CardTitle className="text-center text-xl">Sign in</CardTitle>
        <CardDescription className="text-center">Micromex employees only.</CardDescription>
      </CardHeader>
      <CardContent>
        {errorParam === 'domain' && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            That email isn&apos;t on the @micromex.com domain. Use your work email.
          </div>
        )}
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
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
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
