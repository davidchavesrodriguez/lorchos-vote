'use client';

import { useActionState } from 'react';

import styles from '../../../admin.module.css';
import { importParticipants } from './actions';
import { initialParticipantImportState } from './participant-form-state';

type ParticipantImportFormProps = {
  electionId: string;
};

export function ParticipantImportForm({
  electionId,
}: ParticipantImportFormProps) {
  const [state, formAction, isPending] = useActionState(
    importParticipants,
    initialParticipantImportState,
  );

  return (
    <form
      action={formAction}
      className={styles.censusForm}
      key={JSON.stringify(state)}
      noValidate
    >
      <input type='hidden' name='electionId' value={electionId} />

      {state.formError ? (
        <p className={styles.error} role='alert'>
          {state.formError}
        </p>
      ) : null}
      {state.successMessage ? (
        <p className={styles.successMessage} role='status'>
          {state.successMessage}
        </p>
      ) : null}

      <div className={styles.field}>
        <label htmlFor='participant-names'>Nomes</label>
        <textarea
          id='participant-names'
          name='names'
          rows={7}
          defaultValue={state.values.names}
          aria-describedby={
            state.namesError
              ? 'participant-names-hint participant-names-error'
              : 'participant-names-hint'
          }
          aria-invalid={Boolean(state.namesError) || undefined}
          required
        />
        <p id='participant-names-hint' className={styles.hint}>
          Un nome por liña. Tamén podes separalos por comas.
        </p>
        {state.namesError ? (
          <p
            id='participant-names-error'
            className={styles.fieldError}
            role='alert'
          >
            {state.namesError}
          </p>
        ) : null}
      </div>

      <fieldset className={styles.roleFields}>
        <legend>Roles do lote</legend>
        <label>
          <input
            name='canVote'
            type='checkbox'
            value='true'
            defaultChecked={state.values.canVote}
          />
          Poden votar
        </label>
        <label>
          <input
            name='canBeCandidate'
            type='checkbox'
            value='true'
            defaultChecked={state.values.canBeCandidate}
          />
          Poden ser candidatos
        </label>
      </fieldset>

      <button
        className={styles.primaryButton}
        type='submit'
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? 'Engadindo…' : 'Engadir ao censo'}
      </button>
    </form>
  );
}
