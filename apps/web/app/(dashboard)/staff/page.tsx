'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../../../components/ui';
import { useStaff } from '../../../lib/queries';
import { useSchool } from '../../../lib/school-context';
import { useApi } from '../../../lib/use-api';

export default function StaffPage() {
  const api = useApi();
  const { currentSchoolId } = useSchool();
  const queryClient = useQueryClient();
  const { data: staff, isLoading } = useStaff();

  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: ['invites', currentSchoolId],
    queryFn: async () => {
      const res = await api.invites.$get({ query: { schoolId: currentSchoolId! } });
      if (!res.ok) throw new Error('Failed to load invites');
      return res.json();
    },
    enabled: !!currentSchoolId,
  });

  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher');
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: async () => {
      const res = await api.invites.$post({
        json: { schoolId: currentSchoolId!, phoneNumber, email: email || undefined, role },
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'Failed to create invite');
      return res.json();
    },
    onSuccess: (result) => {
      setCreatedToken(result.token);
      setPhoneNumber('');
      setEmail('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['invites', currentSchoolId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedToken(null);
    invite.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Staff & Invites</h1>
        <p className="text-sm text-slate-500">Teachers and admins on this school, and pending invites.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : staff && staff.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Contact</TableHeaderCell>
                  <TableHeaderCell>Role</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.membershipId}>
                    <TableCell>{s.nameEn}</TableCell>
                    <TableCell>
                      {s.phone}
                      {s.email && <div className="text-xs text-slate-400">{s.email}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.role === 'admin' ? 'brand' : 'neutral'}>{s.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'active' ? 'success' : 'neutral'}>{s.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">No staff yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invites</CardTitle>
        </CardHeader>
        <CardContent>
          {invitesLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : invites && invites.filter((i) => !i.acceptedAt).length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Phone</TableHeaderCell>
                  <TableHeaderCell>Role</TableHeaderCell>
                  <TableHeaderCell>Expires</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invites
                  .filter((i) => !i.acceptedAt)
                  .map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.phoneNumber}</TableCell>
                      <TableCell>
                        <Badge variant="neutral">{i.role}</Badge>
                      </TableCell>
                      <TableCell>{new Date(i.expiresAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-slate-500">No pending invites.</p>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Invite staff member</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-phone">Phone number</Label>
                <Input id="invite-phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email (optional)</Label>
                <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as 'teacher' | 'admin')}>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>
            </div>
            {error && <Alert variant="danger">{error}</Alert>}
            {createdToken && (
              <Alert variant="success">
                Invite created. Share this link: <br />
                <code className="break-all text-xs">{`${window.location.origin}/invite/${createdToken}`}</code>
              </Alert>
            )}
            <Button type="submit" loading={invite.isPending} className="w-fit">
              Send invite
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
