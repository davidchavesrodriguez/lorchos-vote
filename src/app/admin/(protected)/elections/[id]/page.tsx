import { asc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/db';
import { electionParticipants, elections } from '@/db/schema';
import { calculateElectionReadiness } from '@/lib/election-readiness';
import { getElectionStatusLabel } from '@/lib/election-status';
import styles from '../../../admin.module.css';
import {
  MarkAllParticipantsForm,
  ParticipantControls,
} from './participant-controls';
import { ParticipantImportForm } from './participant-import-form';
import { PrepareElectionForm } from './prepare-election-form';

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
  const readiness = isDraft
    ? calculateElectionReadiness(election, participants)
    : null;
  const readinessChecks = readiness
    ? [
        {
          valid: readiness.hasVoters,
          text: readiness.hasVoters
            ? `${readiness.voterCount} ${readiness.voterCount === 1 ? 'persoa pode' : 'persoas poden'} votar`
            : 'Non hai persoas con dereito a voto',
        },
        {
          valid: readiness.hasCandidates,
          text: readiness.hasCandidates
            ? `${readiness.candidateCount} ${readiness.candidateCount === 1 ? 'persoa pode' : 'persoas poden'} ser candidata${readiness.candidateCount === 1 ? '' : 's'}`
            : 'Non hai persoas que poidan ser candidatas',
        },
        {
          valid: readiness.hasEnoughCandidatesForWinners,
          text: readiness.hasEnoughCandidatesForWinners
            ? `Hai candidatos suficientes para ${election.numberOfWinners} ${election.numberOfWinners === 1 ? 'gañador' : 'gañadores'}`
            : 'Faltan candidatos para cubrir as prazas',
        },
        {
          valid:
            readiness.hasVoters &&
            readiness.allVotersHaveEnoughEligibleCandidates,
          text: !readiness.hasVoters
            ? 'Non hai votantes para comprobar as seleccións'
            : readiness.allVotersHaveEnoughEligibleCandidates
              ? `Todos os votantes poden realizar ${election.maxSelections} ${election.maxSelections === 1 ? 'selección' : 'seleccións'}`
              : `Hai ${readiness.affectedVoterCount} ${readiness.affectedVoterCount === 1 ? 'votante que non ten' : 'votantes que non teñen'} suficientes candidatos dispoñibles`,
        },
        {
          valid: readiness.isMinimumTurnoutReachable,
          text:
            election.minimumTurnout === null
              ? 'Sen participación mínima'
              : readiness.isMinimumTurnoutReachable
                ? 'A participación mínima é alcanzable'
                : `A participación mínima require ${election.minimumTurnout} ${election.minimumTurnout === 1 ? 'votante' : 'votantes'} e só hai ${readiness.voterCount} ${readiness.voterCount === 1 ? 'votante' : 'votantes'}`,
        },
      ]
    : [];

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
          <dd>{getElectionStatusLabel(election.status)}</dd>
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

      {election.status === 'READY' ? (
        <p className={styles.readyNotice}>
          A configuración e o censo están pechados. O seguinte paso será xerar
          as ligazóns de voto.
        </p>
      ) : null}

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

      {readiness ? (
        <section
          className={styles.readiness}
          aria-labelledby='readiness-title'
        >
          <h2 id='readiness-title'>Preparación</h2>
          <ul className={styles.readinessList}>
            {readinessChecks.map((check) => (
              <li
                key={check.text}
                className={
                  check.valid
                    ? styles.readinessItemValid
                    : styles.readinessItemInvalid
                }
              >
                <strong>{check.valid ? 'Cumpre:' : 'Non cumpre:'}</strong>{' '}
                {check.text}
              </li>
            ))}
          </ul>
          {readiness.ready ? (
            <PrepareElectionForm electionId={id} />
          ) : (
            <p className={styles.preparationBlocked}>
              A votación só se poderá preparar cando se cumpran todos os
              requisitos anteriores.
            </p>
          )}
        </section>
      ) : null}
    </section>
  );
}
