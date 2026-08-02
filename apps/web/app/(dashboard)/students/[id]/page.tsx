'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { use, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../../components/ui';
import { cn } from '../../../../lib/cn';
import { useSections } from '../../../../lib/queries';
import { useSchool } from '../../../../lib/school-context';
import { useApi } from '../../../../lib/use-api';

type Tab = 'info' | 'guardians' | 'attendance' | 'grades';
const TABS: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Info' },
  { id: 'guardians', label: 'Guardians' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'grades', label: 'Grades' },
];

export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const [tab, setTab] = useState<Tab>('info');

  const { data: student, isLoading } = useQuery({
    queryKey: ['student', currentSchoolId, id],
    queryFn: async () => {
      const res = await api.students[':id'].$get({ param: { id } });
      if (!res.ok) throw new Error('Failed to load student');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!student) return <p className="text-sm text-slate-500">Student not found.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{student.nameEn}</h1>
        <p className="text-sm text-slate-500">Admission No. {student.admissionNo}</p>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-md px-4 py-1.5 transition-colors',
              tab === t.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && <InfoTab student={student} />}
      {tab === 'guardians' && <GuardiansTab studentId={id} />}
      {tab === 'attendance' && <AttendanceTab studentId={id} />}
      {tab === 'grades' && <GradesTab studentId={id} />}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function InfoTab({ student }: { student: any }) {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const { data: sections } = useSections();
  const [editing, setEditing] = useState(false);
  const [nameEn, setNameEn] = useState(student.nameEn);
  const [nameAr, setNameAr] = useState(student.nameAr ?? '');
  const [sectionId, setSectionId] = useState(student.sectionId);
  const [status, setStatus] = useState(student.status);
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: async () => {
      const res = await api.students[':id'].$patch({
        param: { id: student.id },
        json: { nameEn, nameAr: nameAr || undefined, sectionId, status },
      });
      if (!res.ok) {
        const body = (await res.json()) as unknown as { error?: string };
        throw new Error(body.error ?? 'Failed to update');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student', currentSchoolId, student.id] });
      setEditing(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    update.mutate();
  }

  const sectionNameById = new Map((sections ?? []).map((s) => [s.id, s.name]));

  return (
    <Card className="max-w-xl">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Info</CardTitle>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-nameEn">Name (English)</Label>
              <Input id="edit-nameEn" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-nameAr">Name (Arabic)</Label>
              <Input id="edit-nameAr" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-section">Section</Label>
              <Select id="edit-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {sections?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-status">Status</Label>
              <Select id="edit-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="left">Left</option>
                <option value="graduated">Graduated</option>
              </Select>
            </div>
            {error && <Alert variant="danger">{error}</Alert>}
            <div className="flex gap-2">
              <Button type="submit" loading={update.isPending}>
                Save
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Name (Arabic)</dt>
              <dd className="text-slate-900">{student.nameAr ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Date of birth</dt>
              <dd className="text-slate-900">{student.dob}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Gender</dt>
              <dd className="text-slate-900 capitalize">{student.gender}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Section</dt>
              <dd className="text-slate-900">{sectionNameById.get(student.sectionId) ?? student.sectionId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd>
                <Badge variant={student.status === 'active' ? 'success' : 'neutral'}>{student.status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Joined on</dt>
              <dd className="text-slate-900">{student.joinedOn}</dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function GuardiansTab({ studentId }: { studentId: string }) {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const [knownNames, setKnownNames] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState<'father' | 'mother' | 'guardian' | 'other'>('guardian');
  const [error, setError] = useState<string | null>(null);

  const { data: links, isLoading } = useQuery({
    queryKey: ['student-guardians', currentSchoolId, studentId],
    queryFn: async () => {
      const res = await api.students[':studentId'].guardians.$get({ param: { studentId } });
      if (!res.ok) throw new Error('Failed to load guardians');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['student-guardians', currentSchoolId, studentId] });

  const createAndLink = useMutation({
    mutationFn: async () => {
      const createRes = await api.guardians.$post({ json: { nameEn, phone } });
      const createBody = (await createRes.json()) as unknown as { error?: string; id: string };
      if (!createRes.ok) throw new Error(createBody.error ?? 'Failed to create guardian');
      const guardian = createBody;
      const linkRes = await api.students[':studentId'].guardians.$post({
        param: { studentId },
        json: { guardianId: guardian.id, relation },
      });
      if (!linkRes.ok) {
        const linkBody = (await linkRes.json()) as unknown as { error?: string };
        throw new Error(linkBody.error ?? 'Failed to link guardian');
      }
      return { guardian, nameEn };
    },
    onSuccess: ({ guardian, nameEn }) => {
      setKnownNames((prev) => ({ ...prev, [guardian.id]: nameEn }));
      setNameEn('');
      setPhone('');
      setShowForm(false);
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const verify = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await api['student-guardians'][':id'].verify.$post({ param: { id: linkId } });
      if (!res.ok) throw new Error('Failed to verify');
      return res.json();
    },
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await api['student-guardians'][':id'].revoke.$post({ param: { id: linkId } });
      if (!res.ok) throw new Error('Failed to revoke');
      return res.json();
    },
    onSuccess: invalidate,
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Linked guardians</CardTitle>
          <Button variant="secondary" size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Link guardian'}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : links && links.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Guardian</TableHeaderCell>
                  <TableHeaderCell>Relation</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>{knownNames[link.guardianId] ?? `Guardian ${link.guardianId.slice(0, 8)}`}</TableCell>
                    <TableCell className="capitalize">
                      {link.relation}
                      {link.isPrimary && (
                        <Badge variant="brand" className="ml-2">
                          Primary
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {link.revokedAt ? (
                        <Badge variant="danger">Revoked</Badge>
                      ) : link.verifiedAt ? (
                        <Badge variant="success">Verified</Badge>
                      ) : (
                        <Badge variant="warning">Unverified</Badge>
                      )}
                    </TableCell>
                    <TableCell className="flex gap-2">
                      {!link.verifiedAt && !link.revokedAt && (
                        <Button variant="ghost" size="sm" onClick={() => verify.mutate(link.id)}>
                          Verify
                        </Button>
                      )}
                      {!link.revokedAt && (
                        <Button variant="ghost" size="sm" onClick={() => revoke.mutate(link.id)}>
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">No guardians linked yet.</p>
          )}

          {showForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                createAndLink.mutate();
              }}
              className="flex flex-col gap-4 border-t border-slate-100 pt-4"
            >
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="g-name">Name</Label>
                  <Input id="g-name" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="g-phone">Phone</Label>
                  <Input id="g-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="g-relation">Relation</Label>
                  <Select id="g-relation" value={relation} onChange={(e) => setRelation(e.target.value as typeof relation)}>
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                    <option value="guardian">Guardian</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
              </div>
              {error && <Alert variant="danger">{error}</Alert>}
              <Button type="submit" loading={createAndLink.isPending} className="w-fit">
                Create and link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AttendanceTab({ studentId }: { studentId: string }) {
  const api = useApi();
  const { currentSchoolId } = useSchool();

  const { data, isLoading } = useQuery({
    queryKey: ['student-attendance', currentSchoolId, studentId],
    queryFn: async () => {
      const res = await api.attendance.students[':studentId'].history.$get({ param: { studentId }, query: {} });
      if (!res.ok) throw new Error('Failed to load attendance');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!data) return null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-slate-900">{data.summary.presentRate ?? '—'}%</p>
            <p className="text-xs text-slate-500">Present rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-success-600">{data.summary.counts.present}</p>
            <p className="text-xs text-slate-500">Present</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-danger-600">{data.summary.counts.absent}</p>
            <p className="text-xs text-slate-500">Absent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-warning-600">{data.summary.counts.late}</p>
            <p className="text-xs text-slate-500">Late</p>
          </CardContent>
        </Card>
      </div>

      {data.records.length > 0 ? (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Date</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Note</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.records.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.date}</TableCell>
                <TableCell className="capitalize">{r.status}</TableCell>
                <TableCell>{r.note ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-slate-500">No attendance records yet.</p>
      )}
    </div>
  );
}

function GradesTab({ studentId }: { studentId: string }) {
  const api = useApi();
  const { currentSchoolId } = useSchool();

  const { data, isLoading } = useQuery({
    queryKey: ['student-report-cards', currentSchoolId, studentId],
    queryFn: async () => {
      const res = await api['report-cards'].students[':studentId'].$get({ param: { studentId }, query: {} });
      if (!res.ok) throw new Error('Failed to load report cards');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading...</p>;

  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-500">No report cards yet.</p>;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {data.map((rc) => {
        const payload = rc.payload as { subjects?: { subjectName: string; total: number | null; grade: string | null }[] };
        return (
          <Card key={rc.id}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Term report</CardTitle>
              <Badge variant={rc.status === 'published' ? 'success' : 'warning'}>{rc.status}</Badge>
            </CardHeader>
            <CardContent>
              {payload.subjects && payload.subjects.length > 0 ? (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Subject</TableHeaderCell>
                      <TableHeaderCell>Total</TableHeaderCell>
                      <TableHeaderCell>Grade</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payload.subjects.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell>{s.subjectName}</TableCell>
                        <TableCell>{s.total ?? '—'}</TableCell>
                        <TableCell>{s.grade ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-slate-500">No subjects computed.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
