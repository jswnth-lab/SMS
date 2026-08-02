'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Textarea } from '../../../components/ui';
import { useMyTeachingAssignments, useSections, useSubjects } from '../../../lib/queries';
import { useSchool } from '../../../lib/school-context';
import { useApi } from '../../../lib/use-api';

export default function HomeworkPage() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const { data: assignments } = useMyTeachingAssignments();
  const { data: sections } = useSections();
  const { data: subjects } = useSubjects();

  const mySections = [...new Set((assignments ?? []).map((a) => a.sectionId))];
  const sectionNameById = new Map((sections ?? []).map((s) => [s.id, s.name]));
  const subjectNameById = new Map((subjects ?? []).map((s) => [s.id, s.nameEn]));

  const [sectionId, setSectionId] = useState('');
  const subjectsForSection = (assignments ?? []).filter((a) => a.sectionId === sectionId).map((a) => a.subjectId);

  const { data: homework, isLoading } = useQuery({
    queryKey: ['homework', currentSchoolId, sectionId],
    queryFn: async () => {
      const res = await api.homework.sections[':sectionId'].$get({ param: { sectionId } });
      if (!res.ok) throw new Error('Failed to load homework');
      return res.json();
    },
    enabled: !!currentSchoolId && !!sectionId,
  });

  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.homework.$post({ json: { sectionId, subjectId, title, body, dueOn } });
      if (!res.ok) {
        const b = (await res.json()) as unknown as { error?: string };
        throw new Error(b.error ?? 'Failed to create homework');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homework', currentSchoolId, sectionId] });
      setTitle('');
      setBody('');
      setDueOn('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Homework</h1>
        <Select
          value={sectionId}
          onChange={(e) => {
            setSectionId(e.target.value);
            setSubjectId('');
          }}
          className="max-w-xs"
        >
          <option value="">Select section...</option>
          {mySections.map((id) => (
            <option key={id} value={id}>
              {sectionNameById.get(id) ?? id}
            </option>
          ))}
        </Select>
      </div>

      {sectionId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Assigned homework</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : homework && homework.length > 0 ? (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Title</TableHeaderCell>
                      <TableHeaderCell>Subject</TableHeaderCell>
                      <TableHeaderCell>Due</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {homework.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell>{h.title}</TableCell>
                        <TableCell>{subjectNameById.get(h.subjectId) ?? h.subjectId}</TableCell>
                        <TableCell>{h.dueOn}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-slate-500">No homework assigned yet for this section.</p>
              )}
            </CardContent>
          </Card>

          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Assign homework</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="hw-subject">Subject</Label>
                    <Select id="hw-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
                      <option value="">Select...</option>
                      {subjectsForSection.map((id) => (
                        <option key={id} value={id}>
                          {subjectNameById.get(id) ?? id}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="hw-due">Due on</Label>
                    <Input id="hw-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} required />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="hw-title">Title</Label>
                  <Input id="hw-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="hw-body">Details</Label>
                  <Textarea id="hw-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
                </div>
                {error && <Alert variant="danger">{error}</Alert>}
                <Button type="submit" loading={create.isPending} className="w-fit">
                  Assign homework
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
