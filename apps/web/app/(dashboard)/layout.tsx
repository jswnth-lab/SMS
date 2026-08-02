'use client';

import type { ReactNode } from 'react';
import { Sidebar } from '../../components/sidebar';
import { SchoolSwitcher } from '../../components/school-switcher';
import { signOut } from '../../lib/auth-client';
import { useSchool } from '../../lib/school-context';
import { useRequireAuth } from '../../lib/use-require-auth';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { session, isPending } = useRequireAuth();
  const { currentMembership, isLoading: schoolLoading } = useSchool();

  if (isPending || !session) {
    return <p style={{ padding: 24 }}>Loading...</p>;
  }

  if (schoolLoading) {
    return <p style={{ padding: 24 }}>Loading school...</p>;
  }

  if (!currentMembership) {
    return <p style={{ padding: 24 }}>No active school membership on this account.</p>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <aside style={{ padding: 16, borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SchoolSwitcher />
        <Sidebar role={currentMembership.role} />
        <button type="button" onClick={() => signOut()} style={{ marginTop: 'auto' }}>
          Sign out
        </button>
      </aside>
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
