import { desc } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';

import { db } from '@/db';
import { elections } from '@/db/schema';
import { getElectionStatusLabel } from '@/lib/election-status';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Administración | Votacións GB Lorchos',
};

export default async function AdminPage() {
  const electionList = await db
    .select({
      id: elections.id,
      title: elections.title,
      groupLabel: elections.groupLabel,
      status: elections.status,
    })
    .from(elections)
    .orderBy(desc(elections.createdAt));

  return (
    <section aria-labelledby='admin-title'>
      <div className={styles.headingRow}>
        <h1 id='admin-title' className={styles.title}>
          Votacións
        </h1>
        <Link className={styles.primaryLink} href='/admin/elections/new'>
          Nova votación
        </Link>
      </div>

      {electionList.length > 0 ? (
        <ul className={styles.electionList}>
          {electionList.map((election) => (
            <li key={election.id}>
              <Link
                className={styles.electionLink}
                href={`/admin/elections/${election.id}`}
              >
                <span className={styles.electionTitle}>{election.title}</span>
                <span>{election.groupLabel}</span>
                <span>
                  Estado: {getElectionStatusLabel(election.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyState}>
          Aínda non hai ningunha votación.
        </p>
      )}
    </section>
  );
}
