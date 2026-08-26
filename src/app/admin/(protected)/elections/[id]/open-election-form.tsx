'use client';

import type { FormEvent } from 'react';
import { useActionState, useState } from 'react';

import styles from '../../../admin.module.css';
import {
  openElection,
  type ElectionLifecycleActionState,
} from './actions';

type OpenElectionFormProps = {
  electionId: string;
  voterCount: number;
  activeCredentialCount: number;
};

const initialState: ElectionLifecycleActionState = {};
const CONFIRMATION_MESSAGE =
  'Ao abrir a votación, as ligazóns activas poderán utilizarse para votar ata a data límite indicada.';

async function submitOpening(
  previousState: ElectionLifecycleActionState,
  formData: FormData,
): Promise<ElectionLifecycleActionState> {
  const localValue = formData.get('closesAtLocal');

  if (typeof localValue !== 'string' || localValue === '') {
    return { formError: 'Indica unha data límite.' };
  }

  const closesAt = new Date(localValue);

  if (Number.isNaN(closesAt.getTime())) {
    return { formError: 'A data límite non é válida.' };
  }

  formData.delete('closesAtLocal');
  formData.set('closesAt', closesAt.toISOString());

  return openElection(previousState, formData);
}

export function OpenElectionForm({
  electionId,
  voterCount,
  activeCredentialCount,
}: OpenElectionFormProps) {
  const [localValue, setLocalValue] = useState('');
  const [state, formAction, isPending] = useActionState(
    submitOpening,
    initialState,
  );
  const missingCredentialCount = voterCount - activeCredentialCount;
  const allVotersHaveActiveCredential =
    voterCount > 0 && missingCredentialCount === 0;

  function confirmOpening(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(CONFIRMATION_MESSAGE)) {
      event.preventDefault();
    }
  }

  return (
    <section className={styles.lifecycleSection} aria-labelledby='opening-title'>
      <h2 id='opening-title'>Apertura</h2>
      <p>
        Antes de abrir, todo o censo con dereito a voto debe ter unha ligazón
        activa e debe definirse unha data límite.
      </p>
      <p className={styles.credentialCoverage}>
        {voterCount === 0
          ? 'Non hai persoas con dereito a voto.'
          : allVotersHaveActiveCredential
            ? voterCount === 1
              ? '1 de 1 persoa ten unha ligazón activa'
              : `${activeCredentialCount} de ${voterCount} persoas teñen unha ligazón activa`
            : missingCredentialCount === 1
              ? 'Falta 1 persoa por ter unha ligazón activa'
              : `Faltan ${missingCredentialCount} persoas por ter unha ligazón activa`}
      </p>
      <form
        action={formAction}
        className={styles.lifecycleForm}
        onSubmit={confirmOpening}
      >
        <input type='hidden' name='electionId' value={electionId} />
        <div className={styles.field}>
          <label htmlFor='closes-at-local'>Data límite</label>
          <input
            id='closes-at-local'
            name='closesAtLocal'
            type='datetime-local'
            value={localValue}
            onChange={(event) => setLocalValue(event.target.value)}
            required
            aria-describedby='closing-date-hint opening-consequence'
          />
          <p id='closing-date-hint' className={styles.hint}>
            A hora interpretarase segundo o teu dispositivo.
          </p>
        </div>
        <p id='opening-consequence'>{CONFIRMATION_MESSAGE}</p>
        <button
          className={styles.primaryButton}
          type='submit'
          disabled={
            isPending || !allVotersHaveActiveCredential || localValue === ''
          }
          aria-busy={isPending}
        >
          {isPending ? 'Abrindo votación…' : 'Abrir votación'}
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
