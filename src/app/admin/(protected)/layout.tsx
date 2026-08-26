import type { ReactNode } from 'react';

import { requireAdminSession } from '@/lib/admin-session';
import styles from '../admin.module.css';
import { SignOutButton } from './sign-out-button';

type ProtectedAdminLayoutProps = {
  children: ReactNode;
};

export default async function ProtectedAdminLayout({
  children,
}: ProtectedAdminLayoutProps) {
  const session = await requireAdminSession();
  const administrator = session.user.name || session.user.email;

  return (
    <main className={`${styles.page} ${styles.protectedPage}`}>
      <div className={styles.content}>
        <p className={styles.identity}>GB Lorchos · Administración</p>
        {children}
        <div className={styles.session}>
          <p className={styles.sessionLabel}>Sesión iniciada como</p>
          <p className={styles.administrator}>{administrator}</p>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
