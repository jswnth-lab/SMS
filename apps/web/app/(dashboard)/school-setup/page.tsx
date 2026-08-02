'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { useAcademicYears, useGradeLevels, useSections, useSubjects, useTerms } from '../../../lib/queries';
import { useSchool } from '../../../lib/school-context';
import { useApi } from '../../../lib/use-api';

type Step = 'years' | 'terms' | 'grades' | 'sections' | 'subjects';

const STEPS: { id: Step; label: string }[] = [
  { id: 'years', label: '1. Academic Year' },
  { id: 'terms', label: '2. Terms' },
  { id: 'grades', label: '3. Grade Levels' },
  { id: 'sections', label: '4. Sections' },
  { id: 'subjects', label: '5. Subjects' },
];

export default function SchoolSetupPage() {
  const [step, setStep] = useState<Step>('years');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">School Setup</h1>
        <p className="text-sm text-slate-500">Configure academic years, terms, grade levels, sections, and subjects.</p>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={cn(
              'flex-1 rounded-md py-2 text-center transition-colors',
              step === s.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {step === 'years' && <YearsStep />}
      {step === 'terms' && <TermsStep />}
      {step === 'grades' && <GradesStep />}
      {step === 'sections' && <SectionsStep />}
      {step === 'subjects' && <SubjectsStep />}
    </div>
  );
}

function YearsStep() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const { data: years, isLoading } = useAcademicYears();
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await api['academic-years'].$post({ json: { name, startsOn, endsOn } });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed to create year');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years', currentSchoolId] });
      setName('');
      setStartsOn('');
      setEndsOn('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const setCurrent = useMutation({
    mutationFn: async (id: string) => {
      const res = await api['academic-years'][':id']['set-current'].$post({ param: { id } });
      if (!res.ok) throw new Error('Failed to set current year');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['academic-years', currentSchoolId] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Academic Years</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : years && years.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Starts</TableHeaderCell>
                  <TableHeaderCell>Ends</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {years.map((y) => (
                  <TableRow key={y.id}>
                    <TableCell>{y.name}</TableCell>
                    <TableCell>{y.startsOn}</TableCell>
                    <TableCell>{y.endsOn}</TableCell>
                    <TableCell>{y.isCurrent && <Badge variant="brand">Current</Badge>}</TableCell>
                    <TableCell>
                      {!y.isCurrent && (
                        <Button variant="ghost" size="sm" onClick={() => setCurrent.mutate(y.id)}>
                          Set current
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">No academic years yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add academic year</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="year-name">Name</Label>
                <Input id="year-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="2026-2027" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="year-start">Starts on</Label>
                <Input id="year-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="year-end">Ends on</Label>
                <Input id="year-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />
              </div>
            </div>
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <Button type="submit" loading={create.isPending} className="w-fit">
              Add year
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function TermsStep() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const { data: years } = useAcademicYears();
  const [academicYearId, setAcademicYearId] = useState('');
  const { data: terms, isLoading } = useTerms(academicYearId || undefined);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.terms.$post({ json: { academicYearId, name, startsOn, endsOn } });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed to create term');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms', currentSchoolId] });
      setName('');
      setStartsOn('');
      setEndsOn('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Terms</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="terms-year">Academic year</Label>
            <Select id="terms-year" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
              <option value="">All years</option>
              {years?.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : terms && terms.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Starts</TableHeaderCell>
                  <TableHeaderCell>Ends</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {terms.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.name}</TableCell>
                    <TableCell>{t.startsOn}</TableCell>
                    <TableCell>{t.endsOn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">No terms yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add term</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-4 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="term-year">Academic year</Label>
                <Select
                  id="term-year"
                  value={academicYearId}
                  onChange={(e) => setAcademicYearId(e.target.value)}
                  required
                >
                  <option value="">Select...</option>
                  {years?.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="term-name">Name</Label>
                <Input id="term-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Term 1" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="term-start">Starts on</Label>
                <Input id="term-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="term-end">Ends on</Label>
                <Input id="term-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />
              </div>
            </div>
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <Button type="submit" loading={create.isPending} disabled={!academicYearId} className="w-fit">
              Add term
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function GradesStep() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const { data: grades, isLoading } = useGradeLevels();
  const [name, setName] = useState('');
  const [sort, setSort] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await api['grade-levels'].$post({ json: { name, sort: Number(sort) } });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed to create grade level');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grade-levels', currentSchoolId] });
      setName('');
      setSort('1');
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Grade Levels</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : grades && grades.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Sort order</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...grades]
                  .sort((a, b) => a.sort - b.sort)
                  .map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>{g.name}</TableCell>
                      <TableCell>{g.sort}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">No grade levels yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add grade level</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="grade-name">Name</Label>
                <Input id="grade-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Grade 1" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="grade-sort">Sort order</Label>
                <Input id="grade-sort" type="number" value={sort} onChange={(e) => setSort(e.target.value)} required />
              </div>
            </div>
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <Button type="submit" loading={create.isPending} className="w-fit">
              Add grade level
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionsStep() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const { data: grades } = useGradeLevels();
  const { data: years } = useAcademicYears();
  const { data: sections, isLoading } = useSections();
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const gradeNameById = new Map((grades ?? []).map((g) => [g.id, g.name]));

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.sections.$post({ json: { gradeLevelId, academicYearId, name } });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed to create section');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections', currentSchoolId] });
      setName('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Sections</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : sections && sections.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Grade level</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sections.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{gradeNameById.get(s.gradeLevelId) ?? s.gradeLevelId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">No sections yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add section</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="section-year">Academic year</Label>
                <Select id="section-year" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} required>
                  <option value="">Select...</option>
                  {years?.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="section-grade">Grade level</Label>
                <Select id="section-grade" value={gradeLevelId} onChange={(e) => setGradeLevelId(e.target.value)} required>
                  <option value="">Select...</option>
                  {grades?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="section-name">Name</Label>
                <Input id="section-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Section A" required />
              </div>
            </div>
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <Button type="submit" loading={create.isPending} className="w-fit">
              Add section
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SubjectsStep() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const { data: subjects, isLoading } = useSubjects();
  const [nameEn, setNameEn] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.subjects.$post({ json: { nameEn, code } });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed to create subject');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects', currentSchoolId] });
      setNameEn('');
      setCode('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Subjects</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : subjects && subjects.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Code</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {subjects.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.nameEn}</TableCell>
                    <TableCell>{s.code}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">No subjects yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add subject</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="subject-name">Name</Label>
                <Input id="subject-name" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Mathematics" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="subject-code">Code</Label>
                <Input id="subject-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MATH" required />
              </div>
            </div>
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <Button type="submit" loading={create.isPending} className="w-fit">
              Add subject
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
