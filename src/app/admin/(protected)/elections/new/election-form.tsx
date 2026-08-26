'use client';

import { useActionState } from 'react';

import styles from '../../../admin.module.css';
import { createElection } from './actions';
import { initialElectionFormState } from './form-state';

export function ElectionForm() {
  const [state, formAction, isPending] = useActionState(
    createElection,
    initialElectionFormState,
  );

  function errorProps(field: keyof typeof state.values) {
    const hasError = Boolean(state.fieldErrors[field]);

    return {
      'aria-describedby': hasError ? `${field}-error` : undefined,
      'aria-invalid': hasError || undefined,
    };
  }

  return (
    <form
      action={formAction}
      className={styles.form}
      key={JSON.stringify(state)}
      noValidate
    >
      {state.formError ? (
        <p className={styles.error} role='alert'>
          {state.formError}
        </p>
      ) : null}

      <div className={styles.field}>
        <label htmlFor='title'>Nome da votación</label>
        <input
          id='title'
          name='title'
          type='text'
          defaultValue={state.values.title}
          required
          autoComplete='off'
          {...errorProps('title')}
        />
        {state.fieldErrors.title ? (
          <p id='title-error' className={styles.fieldError}>
            {state.fieldErrors.title}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label htmlFor='groupLabel'>Grupo</label>
        <input
          id='groupLabel'
          name='groupLabel'
          type='text'
          defaultValue={state.values.groupLabel}
          required
          autoComplete='off'
          {...errorProps('groupLabel')}
        />
        {state.fieldErrors.groupLabel ? (
          <p id='groupLabel-error' className={styles.fieldError}>
            {state.fieldErrors.groupLabel}
          </p>
        ) : null}
      </div>

      <div className={styles.numberFields}>
        <div className={styles.field}>
          <label htmlFor='numberOfWinners'>Número de gañadores</label>
          <input
            id='numberOfWinners'
            name='numberOfWinners'
            type='number'
            min='1'
            step='1'
            inputMode='numeric'
            defaultValue={state.values.numberOfWinners}
            required
            {...errorProps('numberOfWinners')}
          />
          {state.fieldErrors.numberOfWinners ? (
            <p id='numberOfWinners-error' className={styles.fieldError}>
              {state.fieldErrors.numberOfWinners}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label htmlFor='minSelections'>Seleccións mínimas</label>
          <input
            id='minSelections'
            name='minSelections'
            type='number'
            min='1'
            step='1'
            inputMode='numeric'
            defaultValue={state.values.minSelections}
            required
            {...errorProps('minSelections')}
          />
          {state.fieldErrors.minSelections ? (
            <p id='minSelections-error' className={styles.fieldError}>
              {state.fieldErrors.minSelections}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label htmlFor='maxSelections'>Seleccións máximas</label>
          <input
            id='maxSelections'
            name='maxSelections'
            type='number'
            min='1'
            step='1'
            inputMode='numeric'
            defaultValue={state.values.maxSelections}
            required
            {...errorProps('maxSelections')}
          />
          {state.fieldErrors.maxSelections ? (
            <p id='maxSelections-error' className={styles.fieldError}>
              {state.fieldErrors.maxSelections}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label htmlFor='minimumTurnout'>Participación mínima</label>
          <input
            id='minimumTurnout'
            name='minimumTurnout'
            type='number'
            min='1'
            step='1'
            inputMode='numeric'
            defaultValue={state.values.minimumTurnout}
            aria-describedby={
              state.fieldErrors.minimumTurnout
                ? 'minimumTurnout-hint minimumTurnout-error'
                : 'minimumTurnout-hint'
            }
            aria-invalid={
              Boolean(state.fieldErrors.minimumTurnout) || undefined
            }
          />
          <p id='minimumTurnout-hint' className={styles.hint}>
            Número de persoas · Opcional
          </p>
          {state.fieldErrors.minimumTurnout ? (
            <p id='minimumTurnout-error' className={styles.fieldError}>
              {state.fieldErrors.minimumTurnout}
            </p>
          ) : null}
        </div>
      </div>

      <div className={styles.checkboxField}>
        <input
          id='allowSelfVote'
          name='allowSelfVote'
          type='checkbox'
          value='true'
          defaultChecked={state.values.allowSelfVote}
        />
        <label htmlFor='allowSelfVote'>Permitir autovoto</label>
      </div>

      <button
        className={styles.primaryButton}
        type='submit'
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? 'Creando votación…' : 'Crear votación'}
      </button>
    </form>
  );
}
