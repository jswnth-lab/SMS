'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Input, Label } from '../../components/ui';
import { cn } from '../../lib/cn';
import { authClient } from '../../lib/auth-client';

type Method = 'email' | 'phone';

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: signInError } =
      method === 'email'
        ? await authClient.signIn.email({ email: identifier, password })
        : await authClient.signIn.phoneNumber({ phoneNumber: identifier, password });

    setSubmitting(false);
    if (signInError) {
      setError(signInError.message ?? 'Sign in failed');
      return;
    }
    router.replace('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-semibold text-white shadow-lg shadow-brand-600/30">
            S
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">School Management System</h1>
            <p className="text-sm text-slate-500">Sign in to the admin console</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
          <div className="mb-6 flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
            {(['email', 'phone'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMethod(m);
                  setIdentifier('');
                  setError(null);
                }}
                className={cn(
                  'flex-1 rounded-md py-1.5 transition-colors',
                  method === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {m === 'email' ? 'Email' : 'Phone'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="identifier">{method === 'email' ? 'Email address' : 'Phone number'}</Label>
              <Input
                id="identifier"
                type={method === 'email' ? 'email' : 'tel'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={method === 'email' ? 'you@school.edu' : '+1 555 000 0000'}
                required
                autoComplete={method === 'email' ? 'email' : 'tel'}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                invalid={!!error}
              />
            </div>

            {error && <Alert variant="danger">{error}</Alert>}

            <Button type="submit" size="lg" loading={submitting} className="mt-2 w-full">
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Invited to a school? Use the link from your invite email to set your password.
        </p>
      </div>
    </main>
  );
}
