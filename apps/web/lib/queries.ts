'use client';

import { useQuery } from '@tanstack/react-query';
import { useApi } from './use-api';
import { useSchool } from './school-context';

/**
 * Shared read-only lookups used across several screens (school setup,
 * students form, teaching-assignments matrix, timetable). Each hook is
 * keyed by currentSchoolId so switching schools invalidates the right
 * queries automatically instead of serving stale cross-tenant data.
 */

export function useAcademicYears() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  return useQuery({
    queryKey: ['academic-years', currentSchoolId],
    queryFn: async () => {
      const res = await api['academic-years'].$get();
      if (!res.ok) throw new Error('Failed to load academic years');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });
}

export function useTerms(academicYearId?: string) {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  return useQuery({
    queryKey: ['terms', currentSchoolId, academicYearId],
    queryFn: async () => {
      const res = await api.terms.$get({ query: { academicYearId } });
      if (!res.ok) throw new Error('Failed to load terms');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });
}

export function useGradeLevels() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  return useQuery({
    queryKey: ['grade-levels', currentSchoolId],
    queryFn: async () => {
      const res = await api['grade-levels'].$get();
      if (!res.ok) throw new Error('Failed to load grade levels');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });
}

export function useSections(filters?: { gradeLevelId?: string; academicYearId?: string }) {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  return useQuery({
    queryKey: ['sections', currentSchoolId, filters],
    queryFn: async () => {
      const res = await api.sections.$get({ query: filters ?? {} });
      if (!res.ok) throw new Error('Failed to load sections');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });
}

export function useSubjects() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  return useQuery({
    queryKey: ['subjects', currentSchoolId],
    queryFn: async () => {
      const res = await api.subjects.$get();
      if (!res.ok) throw new Error('Failed to load subjects');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });
}

export function useStaff() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  return useQuery({
    queryKey: ['staff', currentSchoolId],
    queryFn: async () => {
      const res = await api.staff.$get();
      if (!res.ok) throw new Error('Failed to load staff');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });
}

export function useTeachingAssignments(filters?: { academicYearId?: string }) {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  return useQuery({
    queryKey: ['teaching-assignments', currentSchoolId, filters],
    queryFn: async () => {
      const res = await api['teaching-assignments'].$get({ query: filters ?? {} });
      if (!res.ok) throw new Error('Failed to load teaching assignments');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });
}
