'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../../components/ui';
import { useSchool } from '../../lib/school-context';
import { useApi } from '../../lib/use-api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardHome() {
  const { currentMembership } = useSchool();

  if (currentMembership?.role !== 'admin') {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{currentMembership?.schoolName}</h1>
        <p className="mt-1 text-sm text-slate-500">Signed in as {currentMembership?.role}.</p>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const api = useApi();
  const { currentSchoolId, currentMembership } = useSchool();
  const date = today();

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['school-report', currentSchoolId, date],
    queryFn: async () => {
      const res = await api.attendance.school.report.$get({ query: { date } });
      if (!res.ok) throw new Error('Failed to load attendance report');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  const sectionsWithAbsences = (report?.bySection ?? []).filter((s) => s.counts.absent > 0);

  const { data: absentBySections } = useQuery({
    queryKey: ['absent-rosters', currentSchoolId, date, sectionsWithAbsences.map((s) => s.sectionId).join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        sectionsWithAbsences.map(async (s) => {
          const res = await api.attendance.sections[':sectionId'].$get({ param: { sectionId: s.sectionId }, query: { date } });
          if (!res.ok) return { sectionName: s.sectionName, absentees: [] as { nameEn: string }[] };
          const body = await res.json();
          const absentees = body.roster
            .filter((r) => r.status === 'absent')
            .map((r) => ({ nameEn: r.nameEn }));
          return { sectionName: s.sectionName, absentees };
        })
      );
      return results;
    },
    enabled: sectionsWithAbsences.length > 0,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['audit-logs', currentSchoolId],
    queryFn: async () => {
      const res = await api['audit-logs'].$get({ query: { limit: '15' } });
      if (!res.ok) throw new Error('Failed to load activity');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{currentMembership?.schoolName}</h1>
        <p className="text-sm text-slate-500">{date}</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-3xl font-semibold text-slate-900">
              {reportLoading ? '—' : report?.presentRate !== null ? `${report?.presentRate}%` : 'N/A'}
            </p>
            <p className="text-sm text-slate-500">Attendance today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-3xl font-semibold text-success-600">{report?.counts.present ?? '—'}</p>
            <p className="text-sm text-slate-500">Present</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-3xl font-semibold text-danger-600">{report?.counts.absent ?? '—'}</p>
            <p className="text-sm text-slate-500">Absent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-3xl font-semibold text-slate-900">{report?.unmarked ?? '—'}</p>
            <p className="text-sm text-slate-500">Unmarked</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Absent today</CardTitle>
          </CardHeader>
          <CardContent>
            {sectionsWithAbsences.length === 0 ? (
              <p className="text-sm text-slate-500">No absences recorded today.</p>
            ) : !absentBySections ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {absentBySections.map((s) => (
                  <li key={s.sectionName}>
                    <p className="text-sm font-medium text-slate-900">{s.sectionName}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {s.absentees.map((a, i) => (
                        <Badge key={i} variant="danger">
                          {a.nameEn}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : activity && activity.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span>
                      <span className="font-medium text-slate-900">{a.actorName}</span>{' '}
                      <span className="text-slate-500">
                        {a.action} {a.entity}
                      </span>
                    </span>
                    <span className="text-xs text-slate-400">{new Date(a.at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No recent activity.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
