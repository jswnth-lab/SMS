'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Select } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { useSections, useStaff, useSubjects } from '../../../lib/queries';
import { useSchool } from '../../../lib/school-context';
import { useApi } from '../../../lib/use-api';

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
];
const PERIODS = [1, 2, 3, 4, 5, 6];

interface Slot {
  dayOfWeek: number;
  periodNo: number;
  subjectId: string;
  teacherMembershipId: string;
  room?: string | null;
  startsAt: string;
  endsAt: string;
}

interface Conflict {
  dayOfWeek: number;
  periodNo: number;
  type: string;
  message: string;
}

export default function TimetablePage() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const { data: sections } = useSections();
  const { data: subjects } = useSubjects();
  const { data: staff } = useStaff();
  const teachers = (staff ?? []).filter((s) => s.role === 'teacher');

  const [sectionId, setSectionId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [editingCell, setEditingCell] = useState<{ day: number; period: number } | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: existing } = useQuery({
    queryKey: ['timetable', currentSchoolId, sectionId],
    queryFn: async () => {
      const res = await api.timetable.sections[':sectionId'].$get({ param: { sectionId } });
      if (!res.ok) throw new Error('Failed to load timetable');
      return res.json();
    },
    enabled: !!sectionId,
  });

  useEffect(() => {
    if (existing) {
      setSlots(
        existing.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          periodNo: s.periodNo,
          subjectId: s.subjectId,
          teacherMembershipId: s.teacherMembershipId,
          room: s.room,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
        }))
      );
      setConflicts([]);
    }
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await api.timetable.sections[':sectionId'].$post({ param: { sectionId }, json: { slots } });
      const body = (await res.json()) as unknown as { error?: string; conflicts?: Conflict[] };
      if (!res.ok) {
        if (body.conflicts) throw { conflicts: body.conflicts } as { conflicts: Conflict[] };
        throw new Error(body.error ?? 'Failed to save timetable');
      }
      return body;
    },
    onSuccess: () => {
      setError(null);
      setConflicts([]);
      queryClient.invalidateQueries({ queryKey: ['timetable', currentSchoolId, sectionId] });
    },
    onError: (e: unknown) => {
      if (e && typeof e === 'object' && 'conflicts' in e) {
        setConflicts((e as { conflicts: Conflict[] }).conflicts);
        setError('Some slots conflict - fix the highlighted cells and save again.');
      } else {
        setError((e as Error).message);
      }
    },
  });

  const slotAt = (day: number, period: number) => slots.find((s) => s.dayOfWeek === day && s.periodNo === period);
  const conflictAt = (day: number, period: number) => conflicts.find((c) => c.dayOfWeek === day && c.periodNo === period);
  const subjectName = (id: string) => subjects?.find((s) => s.id === id)?.nameEn ?? id;
  const teacherName = (id: string) => teachers.find((t) => t.membershipId === id)?.nameEn ?? id;

  function upsertSlot(slot: Slot) {
    setSlots((prev) => [...prev.filter((s) => !(s.dayOfWeek === slot.dayOfWeek && s.periodNo === slot.periodNo)), slot]);
    setEditingCell(null);
  }

  function removeSlot(day: number, period: number) {
    setSlots((prev) => prev.filter((s) => !(s.dayOfWeek === day && s.periodNo === period)));
    setEditingCell(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Timetable</h1>
        <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="max-w-xs">
          <option value="">Select section...</option>
          {sections?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {sectionId && (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">Period</th>
                  {DAYS.map((d) => (
                    <th key={d.value} className="px-4 py-3 text-left">
                      {d.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {PERIODS.map((period) => (
                  <tr key={period}>
                    <td className="px-4 py-3 font-medium text-slate-500">{period}</td>
                    {DAYS.map((d) => {
                      const slot = slotAt(d.value, period);
                      const conflict = conflictAt(d.value, period);
                      const isEditing = editingCell?.day === d.value && editingCell?.period === period;
                      return (
                        <td key={d.value} className="min-w-[140px] px-2 py-2 align-top">
                          {isEditing ? (
                            <SlotEditor
                              initial={slot}
                              subjects={subjects ?? []}
                              teachers={teachers}
                              onSave={(s) => upsertSlot({ ...s, dayOfWeek: d.value, periodNo: period })}
                              onRemove={slot ? () => removeSlot(d.value, period) : undefined}
                              onCancel={() => setEditingCell(null)}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingCell({ day: d.value, period })}
                              className={cn(
                                'flex w-full flex-col items-start rounded-md border p-2 text-left text-xs transition-colors',
                                conflict
                                  ? 'border-danger-400 bg-danger-50'
                                  : slot
                                    ? 'border-brand-200 bg-brand-50 hover:border-brand-400'
                                    : 'border-dashed border-slate-300 hover:border-brand-400'
                              )}
                            >
                              {slot ? (
                                <>
                                  <span className="font-medium text-slate-900">{subjectName(slot.subjectId)}</span>
                                  <span className="text-slate-500">{teacherName(slot.teacherMembershipId)}</span>
                                  {slot.room && <span className="text-slate-400">{slot.room}</span>}
                                </>
                              ) : (
                                <span className="text-slate-400">+ Add</span>
                              )}
                              {conflict && (
                                <Badge variant="danger" className="mt-1">
                                  {conflict.type.replace(/_/g, ' ')}
                                </Badge>
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button onClick={() => save.mutate()} loading={save.isPending} className="w-fit">
            Save timetable
          </Button>
        </>
      )}
    </div>
  );
}

function SlotEditor({
  initial,
  subjects,
  teachers,
  onSave,
  onRemove,
  onCancel,
}: {
  initial?: Slot;
  subjects: { id: string; nameEn: string }[];
  teachers: { membershipId: string; nameEn: string }[];
  onSave: (slot: Omit<Slot, 'dayOfWeek' | 'periodNo'>) => void;
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? subjects[0]?.id ?? '');
  const [teacherMembershipId, setTeacherMembershipId] = useState(initial?.teacherMembershipId ?? teachers[0]?.membershipId ?? '');
  const [room, setRoom] = useState(initial?.room ?? '');
  const [startsAt, setStartsAt] = useState(initial?.startsAt ?? '08:00:00');
  const [endsAt, setEndsAt] = useState(initial?.endsAt ?? '08:45:00');

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-slate-300 bg-white p-2 text-xs shadow-popover">
      <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-7 text-xs">
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nameEn}
          </option>
        ))}
      </Select>
      <Select value={teacherMembershipId} onChange={(e) => setTeacherMembershipId(e.target.value)} className="h-7 text-xs">
        {teachers.map((t) => (
          <option key={t.membershipId} value={t.membershipId}>
            {t.nameEn}
          </option>
        ))}
      </Select>
      <input
        value={room}
        onChange={(e) => setRoom(e.target.value)}
        placeholder="Room"
        className="h-7 rounded-md border border-slate-300 px-2 text-xs"
      />
      <div className="flex gap-1">
        <input
          type="time"
          value={startsAt.slice(0, 5)}
          onChange={(e) => setStartsAt(`${e.target.value}:00`)}
          className="h-7 w-full rounded-md border border-slate-300 px-1 text-xs"
        />
        <input
          type="time"
          value={endsAt.slice(0, 5)}
          onChange={(e) => setEndsAt(`${e.target.value}:00`)}
          className="h-7 w-full rounded-md border border-slate-300 px-1 text-xs"
        />
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-7 flex-1 px-2 text-xs"
          disabled={!subjectId || !teacherMembershipId}
          onClick={() => onSave({ subjectId, teacherMembershipId, room: room || null, startsAt, endsAt })}
        >
          Save
        </Button>
        {onRemove && (
          <Button variant="danger" size="sm" className="h-7 px-2 text-xs" onClick={onRemove}>
            Remove
          </Button>
        )}
        <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
