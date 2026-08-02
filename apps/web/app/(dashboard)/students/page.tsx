'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Input, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../../../components/ui';
import { useSections } from '../../../lib/queries';
import { useSchool } from '../../../lib/school-context';
import { useApi } from '../../../lib/use-api';

const STATUS_VARIANT = {
  active: 'success',
  left: 'neutral',
  graduated: 'brand',
} as const;

export default function StudentsPage() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const { data: sections } = useSections();
  const [search, setSearch] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const sectionNameById = new Map((sections ?? []).map((s) => [s.id, s.name]));

  const { data, isLoading } = useQuery({
    queryKey: ['students', currentSchoolId, { search, sectionId, status, page }],
    queryFn: async () => {
      const res = await api.students.$get({
        query: {
          page: String(page),
          pageSize: String(pageSize),
          search: search || undefined,
          sectionId: sectionId || undefined,
          status: (status || undefined) as 'active' | 'left' | 'graduated' | undefined,
        },
      });
      if (!res.ok) throw new Error('Failed to load students');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} total</p>
        </div>
        <div className="flex gap-2">
          <Link href="/students/import">
            <Button variant="secondary">Import CSV</Button>
          </Link>
          <Link href="/students/new">
            <Button>Add student</Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search name or admission no..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={sectionId}
          onChange={(e) => {
            setSectionId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All sections</option>
          {sections?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="left">Left</option>
          <option value="graduated">Graduated</option>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : data && data.data.length > 0 ? (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Admission No.</TableHeaderCell>
                <TableHeaderCell>Section</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.data.map((s) => (
                <TableRow key={s.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/students/${s.id}`} className="font-medium text-brand-700 hover:underline">
                      {s.nameEn}
                    </Link>
                  </TableCell>
                  <TableCell>{s.admissionNo}</TableCell>
                  <TableCell>{sectionNameById.get(s.sectionId) ?? s.sectionId}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">No students found.</p>
      )}
    </div>
  );
}
