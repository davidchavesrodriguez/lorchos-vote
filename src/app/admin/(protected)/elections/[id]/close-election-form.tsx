'use client';

import type { FormEvent } from 'react';
import { useActionState } from 'react';

import styles from '../../../admin.module.css';
import {
  closeElection,
  type ElectionLifecycleActionState,
} from './actions';

type CloseElectionFormProps = {
  electionId: string;
};

const initialState: ElectionLifecycleActionState = {};
const CONFIRMATION_MESSAGE =
  'Pechar a votación impedirá emitir novos votos. Esta acción non se poderá desfacer desde a aplicación.';

export function CloseElectionForm({ electionId }: CloseElectionFormProps) {
  const [state, formAction, isPending] = useActionState(
    closeElection,
    initialState,
  );

  function confirmClosing(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(CONFIRMATION_MESSAGE)) {
      event.preventDefault();
    }
  }

  return (
    <section className={styles.lifecycleSection} aria-labelledby='closing-title'>
      <h2 id='closing-title'>Pechar votación</h2>
      <p id='closing-consequence'>{CONFIRMATION_MESSAGE}</p>
      <form action={formAction} onSubmit={confirmClosing}>
        <input type='hidden' name='electionId' value={electionId} />
        <button
          className={styles.closingButton}
          type='submit'
          disabled={isPending}
          aria-busy={isPending}
          aria-describedby='closing-consequence'
        >
          {isPending ? 'Pechando votación…' : 'Pechar votación'}
        </button>
      </form>
      {state.formError ? (
        <p className={styles.inlineError} role='alert'>
          {state.formError}
        </p>
      ) : null}
    </section>
  );
}
