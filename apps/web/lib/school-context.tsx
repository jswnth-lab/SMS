'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getApiClient } from './api';

export interface Membership {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  role: 'student' | 'parent' | 'teacher' | 'admin';
  status: string;
}

interface SchoolContextValue {
  memberships: Membership[];
  currentSchoolId: string | null;
  currentMembership: Membership | null;
  setCurrentSchoolId: (schoolId: string) => void;
  isLoading: boolean;
}

const SchoolContext = createContext<SchoolContextValue | null>(null);

const STORAGE_KEY = 'sms.currentSchoolId';

/**
 * Fetches GET /me (outside tenantRoutes - no X-School-Id needed to call it)
 * to discover which school(s) the signed-in user belongs to, then tracks
 * which one is "current" for every other (tenant-scoped) API call. A user
 * with exactly one active membership never sees a switcher; the API's own
 * tenantContext() middleware only *requires* X-School-Id when there's more
 * than one (see packages/api/src/middleware/tenant-context.ts) - this
 * provider mirrors that by always sending whichever schoolId is current,
 * which is harmless for the single-membership case.
 */
export function SchoolProvider({ children }: { children: ReactNode }) {
  const [currentSchoolId, setCurrentSchoolIdState] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await getApiClient().me.$get();
      if (!res.ok) throw new Error('Failed to load session');
      return res.json();
    },
  });

  const memberships = useMemo(() => (data?.memberships ?? []) as Membership[], [data]);

  useEffect(() => {
    if (memberships.length === 0) return;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const validStored = stored && memberships.some((m) => m.schoolId === stored) ? stored : null;
    setCurrentSchoolIdState(validStored ?? memberships[0].schoolId);
  }, [memberships]);

  function setCurrentSchoolId(schoolId: string) {
    setCurrentSchoolIdState(schoolId);
    window.localStorage.setItem(STORAGE_KEY, schoolId);
  }

  const currentMembership = memberships.find((m) => m.schoolId === currentSchoolId) ?? null;

  return (
    <SchoolContext.Provider
      value={{ memberships, currentSchoolId, currentMembership, setCurrentSchoolId, isLoading }}
    >
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error('useSchool must be used within a SchoolProvider');
  return ctx;
}
