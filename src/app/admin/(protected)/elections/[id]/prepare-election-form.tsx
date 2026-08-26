'use client';

import type { MouseEvent } from 'react';
import { useActionState } from 'react';

import styles from '../../../admin.module.css';
import { prepareElection, type PrepareElectionState } from './actions';

type PrepareElectionFormProps = {
  electionId: string;
};

const initialState: PrepareElectionState = {};
const CONFIRMATION_MESSAGE =
  'Ao preparar a votación, o censo e as regras quedarán bloqueados. A votación aínda non se abrirá nin se xerarán ligazóns.';

export function PrepareElectionForm({
  electionId,
}: PrepareElectionFormProps) {
  const [state, formAction, isPending] = useActionState(
    prepareElection,
    initialState,
  );

  function confirmPreparation(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(CONFIRMATION_MESSAGE)) {
      event.preventDefault();
    }
  }

  return (
    <div className={styles.preparationAction}>
      <p id='preparation-consequence'>{CONFIRMATION_MESSAGE}</p>
      <form action={formAction}>
        <input type='hidden' name='electionId' value={electionId} />
        <button
          className={styles.primaryButton}
          type='submit'
          disabled={isPending}
          aria-busy={isPending}
          aria-describedby='preparation-consequence'
          onClick={confirmPreparation}
        >
          {isPending ? 'Preparando votación…' : 'Preparar votación'}
        </button>
      </form>
      {state.formError ? (
        <p className={styles.inlineError} role='alert'>
          {state.formError}
        </p>
      ) : null}
    </div>
  );
}
