'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Select, Spinner } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { useAcademicYears, useSections, useStaff, useSubjects, useTeachingAssignments } from '../../../lib/queries';
import { useSchool } from '../../../lib/school-context';
import { useApi } from '../../../lib/use-api';

export default function TeachingAssignmentsPage() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();

  const { data: years } = useAcademicYears();
  const [academicYearId, setAcademicYearId] = useState('');
  const { data: staff } = useStaff();
  const { data: sections } = useSections(academicYearId ? { academicYearId } : undefined);
  const { data: subjects } = useSubjects();
  const { data: assignments, isLoading } = useTeachingAssignments(academicYearId ? { academicYearId } : undefined);
  const [error, setError] = useState<string | null>(null);
  const [pendingCell, setPendingCell] = useState<string | null>(null);

  const teachers = (staff ?? []).filter((s) => s.role === 'teacher');

  const assignmentByKey = new Map(
    (assignments ?? []).map((a) => [`${a.teacherMembershipId}:${a.sectionId}:${a.subjectId}`, a])
  );

  const toggle = useMutation({
    mutationFn: async (vars: { key: string; teacherMembershipId: string; sectionId: string; subjectId: string }) => {
      const existing = assignmentByKey.get(vars.key);
      if (existing) {
        const res = await api['teaching-assignments'][':id'].$delete({ param: { id: existing.id } });
        if (!res.ok) throw new Error('Failed to remove assignment');
      } else {
        const res = await api['teaching-assignments'].$post({
          json: {
            teacherMembershipId: vars.teacherMembershipId,
            sectionId: vars.sectionId,
            subjectId: vars.subjectId,
            academicYearId,
          },
        });
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed to create assignment');
      }
    },
    onMutate: (vars) => setPendingCell(vars.key),
    onSettled: () => setPendingCell(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teaching-assignments', currentSchoolId] }),
    onError: (e: Error) => setError(e.message),
  });

  if (!academicYearId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-slate-900">Teaching Assignments</h1>
        <div className="max-w-xs">
          <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
            <option value="">Select academic year...</option>
            {years?.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Teaching Assignments</h1>
        <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="max-w-xs">
          {years?.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </Select>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <p className="text-sm text-slate-500">
        Click a cell to assign or unassign a teacher for a section + subject. Select a subject per row below the teacher name to
        toggle.
      </p>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : sections && sections.length > 0 && teachers.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left">Teacher</th>
                {sections.map((section) => (
                  <th key={section.id} className="px-4 py-3 text-left">
                    {section.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {teachers.map((teacher) => (
                <TeacherRow
                  key={teacher.membershipId}
                  teacher={teacher}
                  sections={sections}
                  subjects={subjects ?? []}
                  assignmentByKey={assignmentByKey}
                  pendingCell={pendingCell}
                  onToggle={(vars) => toggle.mutate(vars)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Need at least one teacher and one section for this year to build a matrix.</p>
      )}
    </div>
  );
}

interface TeacherRowProps {
  teacher: { membershipId: string; nameEn: string };
  sections: { id: string; name: string }[];
  subjects: { id: string; nameEn: string }[];
  assignmentByKey: Map<string, { id: string; subjectId: string }>;
  pendingCell: string | null;
  onToggle: (vars: { key: string; teacherMembershipId: string; sectionId: string; subjectId: string }) => void;
}

function TeacherRow({ teacher, sections, subjects, assignmentByKey, pendingCell, onToggle }: TeacherRowProps) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');

  return (
    <tr>
      <td className="sticky left-0 bg-white px-4 py-3 font-medium text-slate-900">
        {teacher.nameEn}
        <Select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="mt-1 h-8 w-full text-xs"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameEn}
            </option>
          ))}
        </Select>
      </td>
      {sections.map((section) => {
        const key = `${teacher.membershipId}:${section.id}:${subjectId}`;
        const assigned = assignmentByKey.has(key);
        const pending = pendingCell === key;
        return (
          <td key={section.id} className="px-4 py-3">
            <button
              type="button"
              disabled={!subjectId || pending}
              onClick={() => onToggle({ key, teacherMembershipId: teacher.membershipId, sectionId: section.id, subjectId })}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
                assigned ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white hover:border-brand-400'
              )}
            >
              {pending ? <Spinner className="h-3 w-3" /> : assigned ? '✓' : ''}
            </button>
          </td>
        );
      })}
    </tr>
  );
}
