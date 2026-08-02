'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Textarea } from '../../../components/ui';
import { useGradeLevels, useMyTeachingAssignments, useSections } from '../../../lib/queries';
import { useSchool } from '../../../lib/school-context';
import { useApi } from '../../../lib/use-api';

type Scope = 'school' | 'grade' | 'section';

export default function AnnouncementsPage() {
  const api = useApi();
  const { currentSchoolId, currentMembership } = useSchool();
  const isTeacher = currentMembership?.role === 'teacher';
  const queryClient = useQueryClient();
  const { data: gradeLevels } = useGradeLevels();
  const { data: allSections } = useSections();
  const { data: myAssignments } = useMyTeachingAssignments();
  const mySectionIds = new Set((myAssignments ?? []).map((a) => a.sectionId));
  // Teachers can only post to sections they teach (assertCanCreateAnnouncement
  // on the API rejects school/grade scope and unassigned sections for
  // non-admins) - restrict the picker to match instead of letting a teacher
  // pick an option the server will just 403 on.
  const sections = isTeacher ? (allSections ?? []).filter((s) => mySectionIds.has(s.id)) : allSections;

  const { data: announcements, isLoading } = useQuery({
    queryKey: ['announcements', currentSchoolId],
    queryFn: async () => {
      const res = await api.announcements.$get();
      if (!res.ok) throw new Error('Failed to load announcements');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<Scope>(isTeacher ? 'section' : 'school');
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const audience =
        scope === 'school'
          ? { scope: 'school' as const }
          : scope === 'grade'
            ? { scope: 'grade' as const, gradeLevelId }
            : { scope: 'section' as const, sectionId };
      const res = await api.announcements.$post({ json: { title, body, audience } });
      if (!res.ok) {
        const body = (await res.json()) as unknown as { error?: string };
        throw new Error(body.error ?? 'Failed to create announcement');
      }
      return res.json();
    },
    onSuccess: () => {
      setTitle('');
      setBody('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['announcements', currentSchoolId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate();
  }

  const gradeNameById = new Map((gradeLevels ?? []).map((g) => [g.id, g.name]));
  const sectionNameById = new Map((sections ?? []).map((s) => [s.id, s.name]));

  function audienceLabel(audience: unknown) {
    const a = audience as { scope: Scope; gradeLevelId?: string; sectionId?: string };
    if (a.scope === 'school') return 'Whole school';
    if (a.scope === 'grade') return `Grade: ${gradeNameById.get(a.gradeLevelId!) ?? a.gradeLevelId}`;
    return `Section: ${sectionNameById.get(a.sectionId!) ?? a.sectionId}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Announcements</h1>
        <p className="text-sm text-slate-500">Compose announcements and track who has read them.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>New announcement</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ann-title">Title</Label>
              <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ann-body">Body</Label>
              <Textarea id="ann-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ann-scope">Audience</Label>
                <Select id="ann-scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)} disabled={isTeacher}>
                  {!isTeacher && <option value="school">Whole school</option>}
                  {!isTeacher && <option value="grade">Grade level</option>}
                  <option value="section">Section</option>
                </Select>
              </div>
              {scope === 'grade' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ann-grade">Grade level</Label>
                  <Select id="ann-grade" value={gradeLevelId} onChange={(e) => setGradeLevelId(e.target.value)} required>
                    <option value="">Select...</option>
                    {gradeLevels?.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {scope === 'section' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ann-section">Section</Label>
                  <Select id="ann-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
                    <option value="">Select...</option>
                    {sections?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
            {error && <Alert variant="danger">{error}</Alert>}
            <Button type="submit" loading={create.isPending} className="w-fit">
              Publish
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : announcements && announcements.length > 0 ? (
          announcements.map((a) => <AnnouncementCard key={a.id} announcement={a} audienceLabel={audienceLabel(a.audience)} />)
        ) : (
          <p className="text-sm text-slate-500">No announcements yet.</p>
        )}
      </div>
    </div>
  );
}

function AnnouncementCard({
  announcement,
  audienceLabel,
}: {
  announcement: { id: string; title: string; body: string; publishedAt: string | null };
  audienceLabel: string;
}) {
  const api = useApi();

  const { data: reads } = useQuery({
    queryKey: ['announcement-reads', announcement.id],
    queryFn: async () => {
      const res = await api.announcements[':id'].reads.$get({ param: { id: announcement.id } });
      if (!res.ok) throw new Error('Failed to load read count');
      return res.json();
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{announcement.title}</CardTitle>
          <p className="mt-1 text-xs text-slate-400">
            {announcement.publishedAt ? new Date(announcement.publishedAt).toLocaleString() : 'Draft'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral">{audienceLabel}</Badge>
          <Badge variant="brand">{reads ? `${reads.readCount} reads` : '...'}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-700">{announcement.body}</p>
      </CardContent>
    </Card>
  );
}
