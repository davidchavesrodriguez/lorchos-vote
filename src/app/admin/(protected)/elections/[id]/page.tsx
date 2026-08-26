import { asc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/db';
import { electionParticipants, elections } from '@/db/schema';
import styles from '../../../admin.module.css';
import {
  MarkAllParticipantsForm,
  ParticipantControls,
} from './participant-controls';
import { ParticipantImportForm } from './participant-import-form';

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

  const participants = await db
    .select({
      id: electionParticipants.id,
      displayName: electionParticipants.displayName,
      canVote: electionParticipants.canVote,
      canBeCandidate: electionParticipants.canBeCandidate,
    })
    .from(electionParticipants)
    .where(eq(electionParticipants.electionId, id))
    .orderBy(asc(electionParticipants.displayName));
  const isDraft = election.status === 'DRAFT';
  const allParticipantsEligible = participants.every(
    (participant) => participant.canVote && participant.canBeCandidate,
  );

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

      <section className={styles.census} aria-labelledby='census-title'>
        <div className={styles.censusHeading}>
          <h2 id='census-title'>Censo</h2>
          <p>
            {participants.length}{' '}
            {participants.length === 1 ? 'persoa' : 'persoas'}
          </p>
        </div>

        {isDraft ? (
          <details
            className={styles.participantImport}
            open={participants.length === 0}
          >
            <summary>Engadir participantes</summary>
            <div className={styles.participantImportContent}>
              <ParticipantImportForm electionId={id} />
            </div>
          </details>
        ) : null}

        {participants.length === 0 ? (
          <p className={styles.censusEmptyState}>
            Aínda non hai persoas no censo.
          </p>
        ) : (
          <>
            {isDraft && !allParticipantsEligible ? (
              <MarkAllParticipantsForm electionId={id} />
            ) : null}
            <ul className={styles.participantList}>
              {participants.map((participant) => (
                <li key={participant.id} className={styles.participantItem}>
                  <h3>{participant.displayName}</h3>
                  {isDraft ? (
                    <ParticipantControls
                      electionId={id}
                      participant={participant}
                    />
                  ) : (
                    <div className={styles.participantRoles}>
                      <p>Vota: {participant.canVote ? 'Si' : 'Non'}</p>
                      <p>
                        Candidato:{' '}
                        {participant.canBeCandidate ? 'Si' : 'Non'}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </section>
  );
}
