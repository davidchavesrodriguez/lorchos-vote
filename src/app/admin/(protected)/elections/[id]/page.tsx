import { and, asc, eq, sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/db';
import {
  electionParticipants,
  elections,
  votingCredentials,
} from '@/db/schema';
import { calculateElectionReadiness } from '@/lib/election-readiness';
import { getElectionStatusLabel } from '@/lib/election-status';
import styles from '../../../admin.module.css';
import { LocalDateTime } from '../../local-date-time';
import { CloseElectionForm } from './close-election-form';
import { OpenElectionForm } from './open-election-form';
import {
  MarkAllParticipantsForm,
  ParticipantControls,
} from './participant-controls';
import { ParticipantImportForm } from './participant-import-form';
import { PrepareElectionForm } from './prepare-election-form';
import { VotingLinksPanel } from './voting-links-panel';

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
      closesAt: elections.closesAt,
      openedAt: elections.openedAt,
      closedAt: elections.closedAt,
      deadlineExpired:
        sql<boolean>`${elections.closesAt} IS NOT NULL AND ${elections.closesAt} <= now()`,
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
  const isReady = election.status === 'READY';
  const isOpen = election.status === 'OPEN';
  const isClosed = election.status === 'CLOSED';
  const votingParticipants = isReady || isOpen
    ? await db
        .select({
          id: electionParticipants.id,
          displayName: electionParticipants.displayName,
          hasVoted: electionParticipants.hasVoted,
          activeCredentialId: votingCredentials.id,
        })
        .from(electionParticipants)
        .leftJoin(
          votingCredentials,
          and(
            eq(votingCredentials.participantId, electionParticipants.id),
            eq(votingCredentials.status, 'ACTIVE'),
          ),
        )
        .where(
          and(
            eq(electionParticipants.electionId, id),
            eq(electionParticipants.canVote, true),
          ),
        )
        .orderBy(asc(electionParticipants.displayName))
    : [];
  const activeCredentialCount = votingParticipants.filter(
    (participant) => participant.activeCredentialId !== null,
  ).length;
  const isDeadlineExpired = isOpen && election.deadlineExpired;
  const canRegenerateVotingLinks =
    isReady ||
    (isOpen &&
      election.closesAt !== null &&
      !isDeadlineExpired);
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

      {isOpen && election.closesAt ? (
        <p className={styles.openDeadline}>
          Aberta ata <LocalDateTime value={election.closesAt.toISOString()} />
        </p>
      ) : null}

      {isOpen && !election.closesAt ? (
        <p className={styles.lifecycleWarning} role='alert'>
          A votación aberta non ten unha data límite definida.
        </p>
      ) : null}

      {isClosed ? (
        <dl className={styles.lifecycleDates}>
          <div>
            <dt>Apertura</dt>
            <dd>
              {election.openedAt ? (
                <LocalDateTime value={election.openedAt.toISOString()} />
              ) : (
                'Non consta'
              )}
            </dd>
          </div>
          <div>
            <dt>Data límite</dt>
            <dd>
              {election.closesAt ? (
                <LocalDateTime value={election.closesAt.toISOString()} />
              ) : (
                'Non consta'
              )}
            </dd>
          </div>
          <div>
            <dt>Peche</dt>
            <dd>
              {election.closedAt ? (
                <LocalDateTime value={election.closedAt.toISOString()} />
              ) : (
                'Non consta'
              )}
            </dd>
          </div>
        </dl>
      ) : null}

      {isReady ? (
        <p className={styles.readyNotice}>
          A configuración e o censo están pechados. Xera as ligazóns que falten
          antes de abrir a votación.
        </p>
      ) : null}

      {isOpen ? (
        <p className={styles.readyNotice}>
          {isDeadlineExpired
            ? 'O prazo de votación rematou.'
            : 'A votación está aberta. As persoas con ligazón activa poden votar ata a data límite.'}
        </p>
      ) : null}

      {isClosed ? (
        <p className={styles.readyNotice}>
          A votación está pechada e xa non admite novos votos.
        </p>
      ) : null}

      {isReady || isOpen ? (
        <VotingLinksPanel
          key={election.status}
          electionId={id}
          electionStatus={isReady ? 'READY' : 'OPEN'}
          canRegenerate={canRegenerateVotingLinks}
          regenerationUnavailableMessage={
            election.closesAt === null
              ? 'A votación non ten unha data límite válida; non se pode rexenerar a ligazón.'
              : 'O prazo rematou; non se pode rexenerar a ligazón.'
          }
          voters={votingParticipants.map((participant) => ({
            id: participant.id,
            displayName: participant.displayName,
            hasVoted: participant.hasVoted,
            hasActiveCredential: participant.activeCredentialId !== null,
          }))}
        />
      ) : null}

      {isReady ? (
        <OpenElectionForm
          electionId={id}
          voterCount={votingParticipants.length}
          activeCredentialCount={activeCredentialCount}
        />
      ) : null}

      {isOpen ? <CloseElectionForm electionId={id} /> : null}

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
