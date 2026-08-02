'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../../../../components/ui';
import { useSchool } from '../../../../lib/school-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface RowError {
  line: number;
  field?: string;
  message: string;
}

interface PreviewResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: RowError[];
}

export default function ImportStudentsPage() {
  const router = useRouter();
  const { currentSchoolId } = useSchool();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState<number | null>(null);

  async function submit(endpoint: 'preview' | 'confirm') {
    if (!file) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`${API_URL}/import/students/${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: currentSchoolId ? { 'X-School-Id': currentSchoolId } : undefined,
      body: form,
    });
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      if (endpoint === 'confirm' && body.errors) {
        setPreview(body);
      } else {
        setError(body.error ?? 'Import failed');
      }
      return;
    }

    if (endpoint === 'preview') {
      setPreview(body);
    } else {
      setConfirmed(body.inserted);
    }
  }

  if (confirmed !== null) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert variant="success" className="mb-4">
          Imported {confirmed} student{confirmed === 1 ? '' : 's'} successfully.
        </Alert>
        <Button onClick={() => router.push('/students')}>Back to students</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Import students</h1>
        <p className="text-sm text-slate-500">Upload a CSV with columns: admission no, name (en/ar), dob, gender, section, joined on.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Upload file</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="text-sm"
          />
          {error && <Alert variant="danger">{error}</Alert>}
          <Button onClick={() => submit('preview')} disabled={!file} loading={loading} className="w-fit">
            Preview
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>2. Validation report</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-3">
              <Badge variant="neutral">{preview.totalRows} rows</Badge>
              <Badge variant="success">{preview.validCount} valid</Badge>
              {preview.errorCount > 0 && <Badge variant="danger">{preview.errorCount} errors</Badge>}
            </div>

            {preview.errors.length > 0 ? (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Line</TableHeaderCell>
                    <TableHeaderCell>Field</TableHeaderCell>
                    <TableHeaderCell>Error</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.errors.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.line}</TableCell>
                      <TableCell>{e.field ?? '—'}</TableCell>
                      <TableCell>{e.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-success-700">No errors - ready to import.</p>
            )}

            <Button onClick={() => submit('confirm')} disabled={preview.errorCount > 0} loading={loading} className="w-fit">
              Confirm import
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
