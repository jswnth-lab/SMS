'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState, type FormEvent } from 'react';
import { getApiClient } from '../../../lib/api';

interface InviteInfo {
  phoneNumber: string;
  email: string | null;
  role: string;
  schoolName: string | null;
}

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getApiClient()
      .invites[':token'].$get({ param: { token } })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setLoadError((body as { error?: string } | null)?.error ?? 'Invite not found');
          return;
        }
        setInvite((await res.json()) as InviteInfo);
      });
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    const res = await getApiClient().invites[':token'].accept.$post({
      param: { token },
      json: { password, name, nameAr: nameAr || undefined },
    });

    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setSubmitError((body as { error?: string } | null)?.error ?? 'Could not accept invite');
      return;
    }
    router.replace('/login');
  }

  if (loadError) {
    return (
      <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
        <p style={{ color: 'crimson' }}>{loadError}</p>
      </main>
    );
  }

  if (!invite) {
    return (
      <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
        <p>Loading invite...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>Join {invite.schoolName ?? 'your school'}</h1>
      <p>
        {invite.phoneNumber} &middot; {invite.role}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          Name (Arabic, optional)
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        {submitError && <p style={{ color: 'crimson' }}>{submitError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Activate account'}
        </button>
      </form>
    </main>
  );
}
