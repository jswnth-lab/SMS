'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge, Button, Card, CardContent } from '../../../components/ui';
import { useSections, useSubjects } from '../../../lib/queries';
import { useSchool } from '../../../lib/school-context';
import { useApi } from '../../../lib/use-api';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function MyDayPage() {
  const api = useApi();
  const { currentSchoolId, currentMembership } = useSchool();
  const teacherMembershipId = currentMembership?.membershipId;
  const { data: sections } = useSections();
  const { data: subjects } = useSubjects();
  const date = todayIso();
  const dayOfWeek = new Date().getDay(); // Mon=1..Fri=5, matches the schema's dayOfWeek convention

  const { data: slots, isLoading } = useQuery({
    queryKey: ['my-timetable', currentSchoolId, teacherMembershipId],
    queryFn: async () => {
      const res = await api.timetable.teachers[':teacherMembershipId'].$get({ param: { teacherMembershipId: teacherMembershipId! } });
      if (!res.ok) throw new Error('Failed to load timetable');
      return res.json();
    },
    enabled: !!currentSchoolId && !!teacherMembershipId,
  });

  const sectionNameById = new Map((sections ?? []).map((s) => [s.id, s.name]));
  const subjectNameById = new Map((subjects ?? []).map((s) => [s.id, s.nameEn]));

  const todaysSlots = (slots ?? [])
    .filter((s) => s.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.periodNo - b.periodNo);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My Day</h1>
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : dayOfWeek === 0 || dayOfWeek === 6 ? (
        <p className="text-sm text-slate-500">No periods scheduled today.</p>
      ) : todaysSlots.length === 0 ? (
        <p className="text-sm text-slate-500">No periods scheduled today.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {todaysSlots.map((slot) => (
            <Card key={slot.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <Badge variant="brand">Period {slot.periodNo}</Badge>
                  <div>
                    <p className="font-medium text-slate-900">
                      {subjectNameById.get(slot.subjectId) ?? slot.subjectId} — {sectionNameById.get(slot.sectionId) ?? slot.sectionId}
                    </p>
                    <p className="text-xs text-slate-500">
                      {slot.startsAt.slice(0, 5)}–{slot.endsAt.slice(0, 5)}
                      {slot.room && ` · ${slot.room}`}
                    </p>
                  </div>
                </div>
                <Link href={`/attendance/mark/${slot.sectionId}?date=${date}&periodNo=${slot.periodNo}`}>
                  <Button size="sm">Take attendance</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
