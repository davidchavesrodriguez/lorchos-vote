import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/db';
import { elections } from '@/db/schema';
import styles from '../../../admin.module.css';

export const metadata: Metadata = {
  title: 'Detalle da votación | Administración',
};

type ElectionDetailPageProps = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ElectionDetailPage({
  params,
}: ElectionDetailPageProps) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    notFound();
  }

  const [election] = await db
    .select({
      title: elections.title,
      groupLabel: elections.groupLabel,
      status: elections.status,
      numberOfWinners: elections.numberOfWinners,
      minSelections: elections.minSelections,
      maxSelections: elections.maxSelections,
      allowSelfVote: elections.allowSelfVote,
      minimumTurnout: elections.minimumTurnout,
    })
    .from(elections)
    .where(eq(elections.id, id))
    .limit(1);

  if (!election) {
    notFound();
  }

  return (
    <section aria-labelledby='election-title'>
      <Link className={styles.backLink} href='/admin'>
        Volver ás votacións
      </Link>
      <h1 id='election-title' className={styles.title}>
        {election.title}
      </h1>
      <dl className={styles.details}>
        <div>
          <dt>Grupo</dt>
          <dd>{election.groupLabel}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            {election.status === 'DRAFT' ? 'Borrador' : election.status}
          </dd>
        </div>
        <div>
          <dt>Número de gañadores</dt>
          <dd>{election.numberOfWinners}</dd>
        </div>
        <div>
          <dt>Rango de seleccións</dt>
          <dd>
            De {election.minSelections} a {election.maxSelections}
          </dd>
        </div>
        <div>
          <dt>Autovoto</dt>
          <dd>{election.allowSelfVote ? 'Permitido' : 'Non permitido'}</dd>
        </div>
        <div>
          <dt>Participación mínima</dt>
          <dd>{election.minimumTurnout ?? 'Sen mínimo'}</dd>
        </div>
      </dl>
    </section>
  );
}
