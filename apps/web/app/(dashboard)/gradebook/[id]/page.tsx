'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { use, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../../../../components/ui';
import { useSchool } from '../../../../lib/school-context';
import { useApi } from '../../../../lib/use-api';

export default function MarksEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = use(params);
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const scoreRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { data: assessment } = useQuery({
    queryKey: ['assessment', currentSchoolId, assessmentId],
    queryFn: async () => {
      const res = await api.assessments[':id'].$get({ param: { id: assessmentId } });
      if (!res.ok) throw new Error('Failed to load assessment');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  const { data: roster, isLoading } = useQuery({
    queryKey: ['assessment-marks', currentSchoolId, assessmentId],
    queryFn: async () => {
      const res = await api.assessments[':assessmentId'].marks.$get({ param: { assessmentId } });
      if (!res.ok) throw new Error('Failed to load marks');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  const [scores, setScores] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);

  if (roster && !initialized.current) {
    initialized.current = true;
    const initScores: Record<string, string> = {};
    const initRemarks: Record<string, string> = {};
    for (const row of roster) {
      if (row.score != null) initScores[row.studentId] = String(row.score);
      if (row.remark) initRemarks[row.studentId] = row.remark;
    }
    setScores(initScores);
    setRemarks(initRemarks);
  }

  const save = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(scores)
        .filter(([, v]) => v.trim() !== '')
        .map(([studentId, v]) => ({ studentId, score: Number(v), remark: remarks[studentId] || undefined }));
      if (entries.length === 0) return { saved: 0 };
      const res = await api.marks.bulk.$post({ json: { assessmentId, marks: entries } });
      if (!res.ok) {
        const body = (await res.json()) as unknown as { error?: string };
        throw new Error(body.error ?? 'Failed to save marks');
      }
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['assessment-marks', currentSchoolId, assessmentId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  function setScore(studentId: string, value: string) {
    setScores((prev) => ({ ...prev, [studentId]: value }));
    setSaved(false);
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      scoreRefs.current[index + 1]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      scoreRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/\r\n|\r|\n/).filter((l) => l !== '');
    if (lines.length <= 1 || !roster) return; // single value: let default paste happen
    e.preventDefault();
    setScores((prev) => {
      const next = { ...prev };
      lines.forEach((line, offset) => {
        const row = roster[index + offset];
        if (row) next[row.studentId] = line.trim();
      });
      return next;
    });
    setSaved(false);
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!roster) return null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{assessment?.name ?? 'Marks entry'}</h1>
        <p className="text-sm text-slate-500">
          Max marks: {assessment?.maxMarks} · Use arrow keys/Enter to move between rows, or paste a column of scores.
        </p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {saved && <Alert variant="success">Marks saved.</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Score</TableHeaderCell>
                <TableHeaderCell>Remark</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roster.map((row, i) => (
                <TableRow key={row.studentId}>
                  <TableCell>
                    {row.nameEn}
                    <div className="text-xs text-slate-400">{row.admissionNo}</div>
                  </TableCell>
                  <TableCell>
                    <input
                      ref={(el) => {
                        scoreRefs.current[i] = el;
                      }}
                      type="number"
                      value={scores[row.studentId] ?? ''}
                      onChange={(e) => setScore(row.studentId, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={(e) => handlePaste(i, e)}
                      className="h-8 w-20 rounded-md border border-slate-300 px-2 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      value={remarks[row.studentId] ?? ''}
                      onChange={(e) => {
                        setRemarks((prev) => ({ ...prev, [row.studentId]: e.target.value }));
                        setSaved(false);
                      }}
                      className="h-8 w-full rounded-md border border-slate-300 px-2 text-sm"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Button onClick={() => save.mutate()} loading={save.isPending} className="mt-4 w-fit">
            Save marks
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
