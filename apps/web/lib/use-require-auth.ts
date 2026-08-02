'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from './auth-client';

/** Redirects to /login if there's no active session; call at the top of any protected page/layout. */
export function useRequireAuth() {
  const { data, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !data) {
      router.replace('/login');
    }
  }, [isPending, data, router]);

  return { session: data, isPending };
}
