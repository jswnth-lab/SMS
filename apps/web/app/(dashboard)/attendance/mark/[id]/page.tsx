'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { Alert, Badge, Button } from '../../../../../components/ui';
import { cn } from '../../../../../lib/cn';
import { useSchool } from '../../../../../lib/school-context';
import { useApi } from '../../../../../lib/use-api';

type Status = 'present' | 'absent' | 'late' | 'excused';
const STATUSES: { value: Status; label: string; activeClass: string }[] = [
  { value: 'present', label: 'P', activeClass: 'bg-success-500 text-white border-success-500' },
  { value: 'absent', label: 'A', activeClass: 'bg-danger-500 text-white border-danger-500' },
  { value: 'late', label: 'L', activeClass: 'bg-warning-500 text-white border-warning-500' },
  { value: 'excused', label: 'E', activeClass: 'bg-slate-500 text-white border-slate-500' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function MarkAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sectionId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();

  const date = searchParams.get('date') ?? todayIso();
  const periodNoParam = searchParams.get('periodNo');
  const periodNo = periodNoParam ? Number(periodNoParam) : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-roster', currentSchoolId, sectionId, date, periodNo],
    queryFn: async () => {
      const res = await api.attendance.sections[':sectionId'].$get({
        param: { sectionId },
        query: { date, periodNo: periodNo != null ? String(periodNo) : undefined },
      });
      if (!res.ok) throw new Error('Failed to load roster');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, Status> = {};
    const initialNotes: Record<string, string> = {};
    for (const row of data.roster) {
      initial[row.studentId] = (row.status as Status) ?? 'present';
      if (row.note) initialNotes[row.studentId] = row.note;
    }
    setStatuses(initial);
    setNotes(initialNotes);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const records = Object.entries(statuses).map(([studentId, status]) => ({
        studentId,
        status,
        note: notes[studentId] || undefined,
      }));
      const res = await api.attendance.sections[':sectionId'].bulk.$post({
        param: { sectionId },
        json: { date, periodNo: periodNo ?? null, records },
      });
      if (!res.ok) {
        const body = (await res.json()) as unknown as { error?: string };
        throw new Error(body.error ?? 'Failed to save attendance');
      }
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['attendance-roster', currentSchoolId, sectionId, date, periodNo] });
    },
  });

  const absentCount = Object.values(statuses).filter((s) => s !== 'present').length;

  if (isLoading) return <p className="text-sm text-slate-500">Loading roster...</p>;
  if (!data) return null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mark attendance</h1>
          <p className="text-sm text-slate-500">
            {date}
            {periodNo != null && ` · Period ${periodNo}`}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.back()}>
          Back
        </Button>
      </div>

      {save.isError && <Alert variant="danger">{(save.error as Error).message}</Alert>}
      {saved && !save.isPending && <Alert variant="success">Attendance saved.</Alert>}

      <div className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {data.roster.map((row) => {
          const status = statuses[row.studentId] ?? 'present';
          return (
            <div key={row.studentId} className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{row.nameEn}</p>
                  <p className="text-xs text-slate-400">{row.admissionNo}</p>
                </div>
                <div className="flex gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => {
                        setStatuses((prev) => ({ ...prev, [row.studentId]: s.value }));
                        setSaved(false);
                      }}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                        status === s.value ? s.activeClass : 'border-slate-300 bg-white text-slate-500'
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              {status !== 'present' && (
                <input
                  value={notes[row.studentId] ?? ''}
                  onChange={(e) => {
                    setNotes((prev) => ({ ...prev, [row.studentId]: e.target.value }));
                    setSaved(false);
                  }}
                  placeholder="Note (optional)"
                  className="h-8 rounded-md border border-slate-300 px-2 text-xs"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <Badge variant={absentCount > 0 ? 'warning' : 'success'}>
            {absentCount === 0 ? 'All present' : `${absentCount} not present`}
          </Badge>
          <Button onClick={() => save.mutate()} loading={save.isPending} className="flex-1">
            Save attendance
          </Button>
        </div>
      </div>
    </div>
  );
}
