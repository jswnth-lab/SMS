'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../../../components/ui';
import { useMyTeachingAssignments, useSections, useSubjects, useTerms } from '../../../lib/queries';
import { useSchool } from '../../../lib/school-context';
import { useApi } from '../../../lib/use-api';

export default function GradebookPage() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const { data: assignments } = useMyTeachingAssignments();
  const { data: sections } = useSections();
  const { data: subjects } = useSubjects();
  const { data: terms } = useTerms();

  const { data: assessments, isLoading } = useQuery({
    queryKey: ['assessments', currentSchoolId],
    queryFn: async () => {
      const res = await api.assessments.$get({ query: {} });
      if (!res.ok) throw new Error('Failed to load assessments');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  const mySections = [...new Set((assignments ?? []).map((a) => a.sectionId))];
  const sectionNameById = new Map((sections ?? []).map((s) => [s.id, s.name]));
  const subjectNameById = new Map((subjects ?? []).map((s) => [s.id, s.nameEn]));
  const termNameById = new Map((terms ?? []).map((t) => [t.id, t.name]));

  const [sectionId, setSectionId] = useState('');
  const subjectsForSection = (assignments ?? []).filter((a) => a.sectionId === sectionId).map((a) => a.subjectId);
  const [subjectId, setSubjectId] = useState('');
  const [termId, setTermId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('quiz');
  const [maxMarks, setMaxMarks] = useState('100');
  const [weight, setWeight] = useState('1');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.assessments.$post({
        json: {
          sectionId,
          subjectId,
          termId,
          name,
          type,
          maxMarks: Number(maxMarks),
          weight: Number(weight),
          date,
        },
      });
      if (!res.ok) {
        const body = (await res.json()) as unknown as { error?: string };
        throw new Error(body.error ?? 'Failed to create assessment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', currentSchoolId] });
      setName('');
      setDate('');
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
      <h1 className="text-2xl font-semibold text-slate-900">Gradebook</h1>

      <Card>
        <CardHeader>
          <CardTitle>Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : assessments && assessments.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Section</TableHeaderCell>
                  <TableHeaderCell>Subject</TableHeaderCell>
                  <TableHeaderCell>Term</TableHeaderCell>
                  <TableHeaderCell>Date</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {assessments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{sectionNameById.get(a.sectionId) ?? a.sectionId}</TableCell>
                    <TableCell>{subjectNameById.get(a.subjectId) ?? a.subjectId}</TableCell>
                    <TableCell>{termNameById.get(a.termId) ?? a.termId}</TableCell>
                    <TableCell>{a.date}</TableCell>
                    <TableCell>
                      <Link href={`/gradebook/${a.id}`}>
                        <Button variant="ghost" size="sm">
                          Enter marks
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">No assessments yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>New assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="a-section">Section</Label>
                <Select
                  id="a-section"
                  value={sectionId}
                  onChange={(e) => {
                    setSectionId(e.target.value);
                    setSubjectId('');
                  }}
                  required
                >
                  <option value="">Select...</option>
                  {mySections.map((id) => (
                    <option key={id} value={id}>
                      {sectionNameById.get(id) ?? id}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="a-subject">Subject</Label>
                <Select id="a-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required disabled={!sectionId}>
                  <option value="">Select...</option>
                  {subjectsForSection.map((id) => (
                    <option key={id} value={id}>
                      {subjectNameById.get(id) ?? id}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="a-term">Term</Label>
                <Select id="a-term" value={termId} onChange={(e) => setTermId(e.target.value)} required>
                  <option value="">Select...</option>
                  {terms?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="a-name">Name</Label>
                <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Quiz 1" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="a-type">Type</Label>
                <Select id="a-type" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="quiz">Quiz</option>
                  <option value="test">Test</option>
                  <option value="exam">Exam</option>
                  <option value="assignment">Assignment</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="a-date">Date</Label>
                <Input id="a-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="a-max">Max marks</Label>
                <Input id="a-max" type="number" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="a-weight">Weight</Label>
                <Input id="a-weight" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} required />
              </div>
            </div>
            {error && <Alert variant="danger">{error}</Alert>}
            <Button type="submit" loading={create.isPending} className="w-fit">
              Create assessment
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
