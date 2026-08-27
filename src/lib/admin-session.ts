import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { isAdminEmail } from '@/lib/admin-allowlist';
import { auth } from '@/lib/auth';

export const requireAdminSession = cache(async function requireAdminSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !isAdminEmail(session.user.email)) {
    redirect('/admin/login');
  }

  return session;
});
