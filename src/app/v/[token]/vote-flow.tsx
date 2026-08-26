'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { LocalDateTime } from '../local-date-time';
import styles from '../vote.module.css';
import { submitVote, type SubmitVoteResult } from './actions';

type Candidate = {
  id: string;
  displayName: string;
};

type VoteFlowProps = {
  token: string;
  electionTitle: string;
  groupLabel: string;
  voterDisplayName: string;
  minSelections: number;
  maxSelections: number;
  candidates: Candidate[];
  closesAt: string;
};

type Step = 'selection' | 'confirmation' | 'success';

const SUBMISSION_ERRORS: Record<
  Exclude<SubmitVoteResult['type'], 'success'>,
  string
> = {
  invalidLink: 'Esta ligazón non é válida.',
  revoked: 'Esta ligazón xa non é válida. Pide unha nova ao club.',
  used: 'Este voto xa foi emitido.',
  closed: 'A votación está pechada.',
  deadlinePassed: 'O prazo de votación rematou.',
  invalidSelections:
    'As seleccións xa non son válidas. Revisa a votación e téntao de novo.',
  unavailable:
    'A votación non está dispoñible neste momento. Téntao de novo máis tarde.',
};

export function VoteFlow({
  token,
  electionTitle,
  groupLabel,
  voterDisplayName,
  minSelections,
  maxSelections,
  candidates,
  closesAt,
}: VoteFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('selection');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectionIsValid =
    selectedIds.length >= minSelections &&
    selectedIds.length <= maxSelections;
  const selectedCandidates = selectedIds
    .map((selectedId) =>
      candidates.find((candidate) => candidate.id === selectedId),
    )
    .filter((candidate): candidate is Candidate => candidate !== undefined);

  useEffect(() => {
    if (step !== 'selection') {
      stepHeadingRef.current?.focus();
    }
  }, [step]);

  function updateSelection(candidateId: string, checked: boolean) {
    setSubmissionError(null);
    setSelectedIds((currentIds) => {
      if (!checked) {
        return currentIds.filter((id) => id !== candidateId);
      }

      if (
        currentIds.includes(candidateId) ||
        currentIds.length >= maxSelections
      ) {
        return currentIds;
      }

      return [...currentIds, candidateId];
    });
  }

  function continueToConfirmation() {
    if (!selectionIsValid) {
      return;
    }

    setSubmissionError(null);
    setStep('confirmation');
  }

  function returnToSelection() {
    setSubmissionError(null);
    setStep('selection');
  }

  function confirmVote() {
    if (!selectionIsValid || isPending) {
      return;
    }

    setSubmissionError(null);
    startTransition(async () => {
      const result = await submitVote(token, selectedIds);

      if (result.type === 'success') {
        setSelectedIds([]);
        setStep('success');
        return;
      }

      setSubmissionError(SUBMISSION_ERRORS[result.type]);

      if (result.type === 'invalidSelections') {
        setSelectedIds([]);
        setStep('selection');
        router.refresh();
      }
    });
  }

  if (step === 'success') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.brand}>GB Lorchos · Votación</p>
          <section className={styles.success} aria-labelledby='success-title'>
            <h1
              id='success-title'
              className={styles.title}
              ref={stepHeadingRef}
              tabIndex={-1}
            >
              Voto enviado
            </h1>
            <p>O teu voto foi rexistrado correctamente.</p>
            <p>A túa identidade non queda asociada á papeleta.</p>
            <p>Xa podes pechar esta páxina.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <p className={styles.brand}>GB Lorchos · Votación</p>
          <h1 className={styles.title}>{electionTitle}</h1>
          <p className={styles.group}>{groupLabel}</p>
        </header>

        <section className={styles.linkIdentity} aria-label='Identidade da ligazón'>
          <p>
            Esta ligazón corresponde a <strong>{voterDisplayName}</strong>.
          </p>
          <p>Se non es ti, non votes con esta ligazón e avisa ao club.</p>
        </section>

        <p className={styles.deadline}>
          Data límite: <LocalDateTime value={closesAt} />
        </p>

        {step === 'selection' ? (
          <form
            className={styles.selection}
            onSubmit={(event) => {
              event.preventDefault();
              continueToConfirmation();
            }}
          >
            <fieldset>
              <legend>
                {minSelections === maxSelections
                  ? `Escolle ${maxSelections} persoas`
                  : `Escolle entre ${minSelections} e ${maxSelections} persoas`}
              </legend>
              <p className={styles.counter} aria-live='polite'>
                {selectedIds.length} de {maxSelections} seleccionadas
              </p>
              <ul className={styles.candidateList}>
                {candidates.map((candidate) => {
                  const isSelected = selectedIds.includes(candidate.id);
                  const cannotSelectMore =
                    !isSelected && selectedIds.length >= maxSelections;

                  return (
                    <li key={candidate.id}>
                      <label className={styles.candidateOption}>
                        <input
                          type='checkbox'
                          checked={isSelected}
                          disabled={cannotSelectMore}
                          onChange={(event) =>
                            updateSelection(candidate.id, event.target.checked)
                          }
                        />
                        <span>{candidate.displayName}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            {submissionError ? (
              <p className={styles.error} role='alert'>
                {submissionError}
              </p>
            ) : null}

            <button
              className={styles.primaryButton}
              type='submit'
              disabled={!selectionIsValid}
            >
              Continuar
            </button>
          </form>
        ) : (
          <section
            className={styles.confirmation}
            aria-labelledby='confirmation-title'
          >
            <h2
              id='confirmation-title'
              ref={stepHeadingRef}
              tabIndex={-1}
            >
              Confirma as túas seleccións
            </h2>
            <ul className={styles.confirmationList}>
              {selectedCandidates.map((candidate) => (
                <li key={candidate.id}>{candidate.displayName}</li>
              ))}
            </ul>

            {submissionError ? (
              <p className={styles.error} role='alert'>
                {submissionError}
              </p>
            ) : null}

            <div className={styles.actions}>
              <button
                className={styles.secondaryButton}
                type='button'
                onClick={returnToSelection}
                disabled={isPending}
              >
                Volver e cambiar
              </button>
              <button
                className={styles.primaryButton}
                type='button'
                onClick={confirmVote}
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? 'Enviando voto…' : 'Confirmar voto'}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
