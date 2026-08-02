'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from '../../../../components/ui';
import { useSections } from '../../../../lib/queries';
import { useApi } from '../../../../lib/use-api';

export default function NewStudentPage() {
  const api = useApi();
  const router = useRouter();
  const { data: sections } = useSections();

  const [admissionNo, setAdmissionNo] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [sectionId, setSectionId] = useState('');
  const [joinedOn, setJoinedOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.students.$post({
        json: {
          admissionNo,
          nameEn,
          nameAr: nameAr || undefined,
          dob,
          gender: gender as 'male' | 'female',
          sectionId,
          joinedOn,
        },
      });
      const body = (await res.json()) as unknown as { error?: string; id: string };
      if (!res.ok) throw new Error(body.error ?? 'Failed to create student');
      return body;
    },
    onSuccess: (student) => router.push(`/students/${student.id}`),
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Add student</h1>
      <Card>
        <CardHeader>
          <CardTitle>Student details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="admissionNo">Admission No.</Label>
                <Input id="admissionNo" value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sectionId">Section</Label>
                <Select id="sectionId" value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
                  <option value="">Select...</option>
                  {sections?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nameEn">Name (English)</Label>
                <Input id="nameEn" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nameAr">Name (Arabic)</Label>
                <Input id="nameAr" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dob">Date of birth</Label>
                <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gender">Gender</Label>
                <Select id="gender" value={gender} onChange={(e) => setGender(e.target.value as 'male' | 'female')} required>
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="joinedOn">Joined on</Label>
                <Input id="joinedOn" type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} required />
              </div>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}

            <Button type="submit" loading={create.isPending} className="w-fit">
              Create student
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
