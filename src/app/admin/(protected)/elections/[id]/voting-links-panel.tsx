'use client';

import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import styles from '../../../admin.module.css';
import {
  generateVotingLinks,
  regenerateVotingLink,
  type VotingLinkActionResult,
} from './actions';

type VotingLinkVoter = {
  id: string;
  displayName: string;
  hasVoted: boolean;
  hasActiveCredential: boolean;
};

type VotingLinksPanelProps = {
  electionId: string;
  electionStatus: 'READY' | 'OPEN';
  canRegenerate: boolean;
  regenerationUnavailableMessage?: string;
  voters: VotingLinkVoter[];
};

const GENERIC_CLIENT_ERROR =
  'Non foi posible completar a operación. Téntao de novo dentro duns intres.';

export function VotingLinksPanel({
  electionId,
  electionStatus,
  canRegenerate,
  regenerationUnavailableMessage,
  voters,
}: VotingLinksPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingParticipantId, setPendingParticipantId] = useState<
    string | null
  >(null);
  const [revealedLinks, setRevealedLinks] = useState<
    NonNullable<VotingLinkActionResult['generatedLinks']>
  >([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const activeParticipantIds = new Set(
    voters
      .filter((voter) => voter.hasActiveCredential)
      .map((voter) => voter.id),
  );

  for (const link of revealedLinks) {
    activeParticipantIds.add(link.participantId);
  }

  const allPendingVotersHaveActiveCredential = voters.every(
    (voter) => voter.hasVoted || activeParticipantIds.has(voter.id),
  );

  function applyActionResult(result: VotingLinkActionResult) {
    setActionError(result.formError ?? null);
    setActionMessage(result.successMessage ?? null);

    if (!result.generatedLinks?.length) {
      return;
    }

    setRevealedLinks((currentLinks) => {
      const linksByParticipant = new Map(
        currentLinks.map((link) => [link.participantId, link]),
      );

      for (const link of result.generatedLinks ?? []) {
        linksByParticipant.set(link.participantId, link);
      }

      return [...linksByParticipant.values()];
    });
    router.refresh();
  }

  function handleBulkGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingParticipantId(null);
    setActionError(null);
    setActionMessage(null);

    startTransition(async () => {
      try {
        applyActionResult(await generateVotingLinks(electionId));
      } catch {
        setActionError(GENERIC_CLIENT_ERROR);
      }
    });
  }

  function handleIndividualGeneration(
    event: FormEvent<HTMLFormElement>,
    voter: VotingLinkVoter,
  ) {
    event.preventDefault();

    if (
      activeParticipantIds.has(voter.id) &&
      !window.confirm(
        `Queres rexenerar a ligazón de «${voter.displayName}»? A ligazón anterior deixará de funcionar.`,
      )
    ) {
      return;
    }

    setPendingParticipantId(voter.id);
    setActionError(null);
    setActionMessage(null);

    startTransition(async () => {
      try {
        applyActionResult(
          await regenerateVotingLink(electionId, voter.id),
        );
      } catch {
        setActionError(GENERIC_CLIENT_ERROR);
      }
    });
  }

  async function copyText(text: string, successMessage: string) {
    setCopyMessage(null);
    setCopyError(null);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('ClipboardUnavailable');
      }

      await navigator.clipboard.writeText(text);
      setCopyMessage(successMessage);
    } catch {
      setCopyError(
        'Non foi posible copiar. Selecciona a ligazón e cópiaa manualmente.',
      );
    }
  }

  function copyAllLinks() {
    const plainText = revealedLinks
      .map((link) => `${link.displayName} — ${link.votingUrl}`)
      .join('\n');

    void copyText(plainText, 'Todas as ligazóns visibles foron copiadas.');
  }

  return (
    <section className={styles.votingLinks} aria-labelledby='voting-links-title'>
      <div className={styles.votingLinksHeading}>
        <div>
          <h2 id='voting-links-title'>Ligazóns de voto</h2>
          <p>
            {voters.length}{' '}
            {voters.length === 1
              ? 'persoa con dereito a voto'
              : 'persoas con dereito a voto'}
          </p>
        </div>
        <p>
          {activeParticipantIds.size}{' '}
          {activeParticipantIds.size === 1
            ? 'ligazón activa'
            : 'ligazóns activas'}
        </p>
      </div>

      {electionStatus === 'READY' ? (
        <form
          onSubmit={handleBulkGeneration}
          className={styles.votingLinksBulkAction}
        >
          <button
            className={styles.primaryButton}
            type='submit'
            disabled={isPending || allPendingVotersHaveActiveCredential}
            aria-busy={isPending && pendingParticipantId === null}
          >
            {isPending && pendingParticipantId === null
              ? 'Xerando ligazóns…'
              : 'Xerar ligazóns pendentes'}
          </button>
        </form>
      ) : null}

      {actionError ? (
        <p className={styles.inlineError} role='alert'>
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className={styles.inlineSuccess} role='status'>
          {actionMessage}
        </p>
      ) : null}

      {revealedLinks.length > 0 ? (
        <section
          className={styles.revealedVotingLinks}
          aria-labelledby='revealed-voting-links-title'
        >
          <h3 id='revealed-voting-links-title'>Ligazóns xeradas</h3>
          <p className={styles.secretWarning}>
            Estas ligazóns só se mostrarán nesta ocasión. Garda ou envía cada
            unha antes de saír desta pantalla.
          </p>
          <button
            className={styles.secondaryButton}
            type='button'
            onClick={copyAllLinks}
          >
            Copiar todas
          </button>
          <ul className={styles.revealedVotingLinksList}>
            {revealedLinks.map((link) => (
              <li key={link.participantId}>
                <strong>{link.displayName}</strong>
                <code className={styles.votingUrl}>{link.votingUrl}</code>
                <button
                  className={styles.compactButton}
                  type='button'
                  onClick={() =>
                    void copyText(
                      link.votingUrl,
                      `Ligazón de ${link.displayName} copiada.`,
                    )
                  }
                >
                  Copiar
                </button>
              </li>
            ))}
          </ul>
          {copyError ? (
            <p className={styles.inlineError} role='alert'>
              {copyError}
            </p>
          ) : null}
          {copyMessage ? (
            <p className={styles.inlineSuccess} role='status' aria-live='polite'>
              {copyMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {voters.length === 0 ? (
        <p className={styles.censusEmptyState}>
          Non hai persoas con dereito a voto.
        </p>
      ) : (
        <ul className={styles.votingLinkVoterList}>
          {voters.map((voter) => {
            const hasActiveCredential = activeParticipantIds.has(voter.id);
            const isThisVoterPending =
              isPending && pendingParticipantId === voter.id;

            return (
              <li key={voter.id}>
                <div>
                  <h3>{voter.displayName}</h3>
                  <p>
                    {hasActiveCredential
                      ? 'Ligazón activa'
                      : 'Sen ligazón'}
                  </p>
                </div>
                {voter.hasVoted ? (
                  <p className={styles.votingLinkUnavailable}>
                    Xa votou; non se pode xerar outra ligazón.
                  </p>
                ) : !canRegenerate ? (
                  <p className={styles.votingLinkUnavailable}>
                    {regenerationUnavailableMessage ??
                      'Non se pode rexenerar a ligazón neste estado.'}
                  </p>
                ) : (
                  <form
                    onSubmit={(event) =>
                      handleIndividualGeneration(event, voter)
                    }
                  >
                    <button
                      className={styles.compactButton}
                      type='submit'
                      disabled={isPending}
                      aria-busy={isThisVoterPending}
                    >
                      {isThisVoterPending
                        ? hasActiveCredential
                          ? 'Rexenerando…'
                          : 'Xerando…'
                        : hasActiveCredential
                          ? 'Rexenerar ligazón'
                          : 'Xerar ligazón'}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
