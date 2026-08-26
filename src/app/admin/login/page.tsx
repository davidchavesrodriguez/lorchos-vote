import type { Metadata } from 'next';

import styles from '../admin.module.css';
import { LoginButton } from './login-button';

export const metadata: Metadata = {
  title: 'Acceso administrativo | Votacións GB Lorchos',
};

type AdminLoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <p className={styles.identity}>GB Lorchos · Administración</p>
        <h1 className={styles.title}>Acceso administrativo</h1>
        <p className={styles.description}>
          Inicia sesión coa conta de Google autorizada para administrar as
          votacións.
        </p>
        <LoginButton hasAuthenticationError={Boolean(error)} />
      </div>
    </main>
  );
}
