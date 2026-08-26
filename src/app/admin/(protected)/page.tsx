import type { Metadata } from 'next';

import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Administración | Votacións GB Lorchos',
};

export default function AdminPage() {
  return (
    <section aria-labelledby='admin-title'>
      <h1 id='admin-title' className={styles.title}>
        Acceso administrativo activo
      </h1>
      <p className={styles.description}>
        A autenticación funciona correctamente. As ferramentas de xestión
        engadiranse en próximas iteracións.
      </p>
    </section>
  );
}
