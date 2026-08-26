import type { Metadata } from 'next';
import Link from 'next/link';

import styles from '../../../admin.module.css';
import { ElectionForm } from './election-form';

export const metadata: Metadata = {
  title: 'Nova votación | Administración',
};

export default function NewElectionPage() {
  return (
    <section aria-labelledby='new-election-title'>
      <Link className={styles.backLink} href='/admin'>
        Volver ás votacións
      </Link>
      <h1 id='new-election-title' className={styles.title}>
        Nova votación
      </h1>
      <p className={styles.description}>
        A votación gardarase como borrador.
      </p>
      <ElectionForm />
    </section>
  );
}
