'use client';

import type { ReactNode } from 'react';
import { Sidebar } from '../../components/sidebar';
import { SchoolSwitcher } from '../../components/school-switcher';
import { Button } from '../../components/ui';
import { signOut } from '../../lib/auth-client';
import { useSchool } from '../../lib/school-context';
import { useRequireAuth } from '../../lib/use-require-auth';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { session, isPending } = useRequireAuth();
  const { currentMembership, isLoading: schoolLoading } = useSchool();

  if (isPending || !session) {
    return <p className="p-6 text-sm text-slate-500">Loading...</p>;
  }

  if (schoolLoading) {
    return <p className="p-6 text-sm text-slate-500">Loading school...</p>;
  }

  if (!currentMembership) {
    return <p className="p-6 text-sm text-slate-500">No active school membership on this account.</p>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col gap-6 border-r border-slate-200 bg-white p-4">
        <SchoolSwitcher />
        <Sidebar role={currentMembership.role} />
        <Button variant="secondary" size="sm" onClick={() => signOut()} className="mt-auto">
          Sign out
        </Button>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
