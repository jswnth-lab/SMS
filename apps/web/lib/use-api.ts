'use client';

import { useMemo } from 'react';
import { getApiClient } from './api';
import { useSchool } from './school-context';

/** Typed API client pre-scoped to whichever school is currently selected. */
export function useApi() {
  const { currentSchoolId } = useSchool();
  return useMemo(() => getApiClient(currentSchoolId ?? undefined), [currentSchoolId]);
}
