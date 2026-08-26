'use client';

import type { MouseEvent } from 'react';
import { useActionState } from 'react';

import styles from '../../../admin.module.css';
import {
  deleteParticipant,
  markAllParticipantsEligible,
  updateParticipantRoles,
} from './actions';
import { initialParticipantMutationState } from './participant-form-state';

type ParticipantControlsProps = {
  electionId: string;
  participant: {
    id: string;
    displayName: string;
    canVote: boolean;
    canBeCandidate: boolean;
  };
};

export function ParticipantControls({
  electionId,
  participant,
}: ParticipantControlsProps) {
  const [updateState, updateAction, isUpdating] = useActionState(
    updateParticipantRoles,
    initialParticipantMutationState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteParticipant,
    initialParticipantMutationState,
  );

  function confirmDeletion(event: MouseEvent<HTMLButtonElement>) {
    if (
      !window.confirm(
        `Queres eliminar a «${participant.displayName}» do censo?`,
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <div className={styles.participantControls}>
      <form action={updateAction} className={styles.participantRoleForm}>
        <input type='hidden' name='electionId' value={electionId} />
        <input type='hidden' name='participantId' value={participant.id} />
        <div className={styles.participantRoleFields}>
          <label>
            <input
              name='canVote'
              type='checkbox'
              value='true'
              defaultChecked={participant.canVote}
              aria-label={`${participant.displayName}: pode votar`}
            />
            Pode votar
          </label>
          <label>
            <input
              name='canBeCandidate'
              type='checkbox'
              value='true'
              defaultChecked={participant.canBeCandidate}
              aria-label={`${participant.displayName}: pode ser candidato`}
            />
            Pode ser candidato
          </label>
        </div>
        <div className={styles.participantActionButtons}>
          <button
            className={styles.compactButton}
            type='submit'
            disabled={isUpdating || isDeleting}
            aria-busy={isUpdating}
          >
            {isUpdating ? 'Gardando…' : 'Gardar'}
          </button>
          <button
            className={styles.deleteButton}
            type='submit'
            formAction={deleteAction}
            disabled={isUpdating || isDeleting}
            aria-busy={isDeleting}
            onClick={confirmDeletion}
          >
            {isDeleting ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </form>

      {updateState.formError ? (
        <p className={styles.inlineError} role='alert'>
          {updateState.formError}
        </p>
      ) : null}
      {updateState.successMessage ? (
        <p className={styles.inlineSuccess} role='status'>
          {updateState.successMessage}
        </p>
      ) : null}
      {deleteState.formError ? (
        <p className={styles.inlineError} role='alert'>
          {deleteState.formError}
        </p>
      ) : null}
    </div>
  );
}

type MarkAllParticipantsFormProps = {
  electionId: string;
};

export function MarkAllParticipantsForm({
  electionId,
}: MarkAllParticipantsFormProps) {
  const [state, formAction, isPending] = useActionState(
    markAllParticipantsEligible,
    initialParticipantMutationState,
  );

  return (
    <div className={styles.markAllAction}>
      <form action={formAction}>
        <input type='hidden' name='electionId' value={electionId} />
        <button
          className={styles.secondaryButton}
          type='submit'
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending
            ? 'Actualizando o censo…'
            : 'Marcar todo o censo como votante e candidato'}
        </button>
      </form>
      {state.formError ? (
        <p className={styles.inlineError} role='alert'>
          {state.formError}
        </p>
      ) : null}
      {state.successMessage ? (
        <p className={styles.inlineSuccess} role='status'>
          {state.successMessage}
        </p>
      ) : null}
    </div>
  );
}
