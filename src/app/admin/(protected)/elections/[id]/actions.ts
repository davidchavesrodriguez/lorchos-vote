'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db';
import { electionParticipants, elections } from '@/db/schema';
import { requireAdminSession } from '@/lib/admin-session';
import {
  transitionOpenElectionToClosed,
  transitionReadyElectionToOpen,
} from '@/lib/election-lifecycle';
import { transitionDraftElectionToReady } from '@/lib/election-preparation';
import {
  generateMissingVotingCredentials,
  regenerateVotingCredential,
  type GeneratedVotingLink,
} from '@/lib/voting-credentials';

import type {
  ParticipantImportState,
  ParticipantMutationState,
} from './participant-form-state';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRAFT_REQUIRED_ERROR =
  'O censo só se pode modificar mentres a votación está en borrador.';
const ELECTION_NOT_FOUND_ERROR = 'A votación xa non existe.';
const PARTICIPANT_NOT_FOUND_ERROR = 'A persoa xa non existe neste censo.';
const GENERIC_ERROR =
  'Non foi posible completar a operación. Téntao de novo dentro duns intres.';
const PREPARATION_DRAFT_REQUIRED_ERROR =
  'A votación só se pode preparar mentres está en borrador.';
const NOT_READY_ERROR =
  'A votación non se pode preparar porque o censo ou as regras xa non cumpren todos os requisitos.';
const VOTING_LINKS_READY_REQUIRED_ERROR =
  'As ligazóns de voto só se poden xerar para unha votación preparada.';
const VOTING_LINKS_REGENERATION_STATUS_ERROR =
  'As ligazóns de voto só se poden rexenerar mentres a votación está preparada ou aberta.';
const VOTING_LINKS_MISSING_DEADLINE_ERROR =
  'A votación aberta non ten unha data límite válida e non permite rexenerar ligazóns.';
const VOTING_LINKS_DEADLINE_PASSED_ERROR =
  'O prazo de votación rematou e xa non se poden rexenerar ligazóns.';
const VOTER_NOT_FOUND_ERROR =
  'A persoa non existe nesta votación ou non ten dereito a voto.';
const VOTER_HAS_VOTED_ERROR =
  'Non se pode xerar outra ligazón porque esta persoa xa votou.';
const OPENING_READY_REQUIRED_ERROR =
  'A votación só se pode abrir cando está preparada.';
const INVALID_CLOSING_DATE_ERROR =
  'A data límite recibida non é válida. Escolle de novo a data e a hora.';
const CLOSING_DATE_NOT_FUTURE_ERROR =
  'A data límite debe ser posterior ao momento de apertura.';
const OPENING_NO_VOTERS_ERROR =
  'A votación non se pode abrir porque non hai persoas con dereito a voto.';
const CLOSING_OPEN_REQUIRED_ERROR =
  'Só se pode pechar unha votación que estea aberta.';

export type PrepareElectionState = {
  formError?: string;
};

export type ElectionLifecycleActionState = {
  formError?: string;
};

export type VotingLinkActionResult = {
  generatedLinks?: GeneratedVotingLink[];
  formError?: string;
  successMessage?: string;
};

function readString(formData: FormData, field: string): string {
  const value = formData.get(field);

  return typeof value === 'string' ? value : '';
}

function readChecked(formData: FormData, field: string): boolean {
  return formData.get(field) === 'true';
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('gl');
}

function parseNames(value: string): string[] {
  return value
    .split(/[\r\n,]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function findRepeatedNames(names: string[]): string[] {
  const firstNameByNormalizedName = new Map<string, string>();
  const repeatedNames = new Set<string>();

  for (const name of names) {
    const normalizedName = normalizeName(name);
    const firstName = firstNameByNormalizedName.get(normalizedName);

    if (firstName) {
      repeatedNames.add(firstName);
    } else {
      firstNameByNormalizedName.set(normalizedName, name);
    }
  }

  return [...repeatedNames];
}

function logUnexpected(operation: string, error: unknown) {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  console.error(`${operation} failed (${errorName})`);
}

function mutationError(result: 'missing' | 'notDraft') {
  return result === 'missing'
    ? ELECTION_NOT_FOUND_ERROR
    : DRAFT_REQUIRED_ERROR;
}

export async function importParticipants(
  _previousState: ParticipantImportState,
  formData: FormData,
): Promise<ParticipantImportState> {
  await requireAdminSession();

  const electionId = readString(formData, 'electionId');
  const values = {
    names: readString(formData, 'names'),
    canVote: readChecked(formData, 'canVote'),
    canBeCandidate: readChecked(formData, 'canBeCandidate'),
  };
  const names = parseNames(values.names);

  if (!UUID_PATTERN.test(electionId)) {
    return { values, formError: ELECTION_NOT_FOUND_ERROR };
  }

  if (names.length === 0) {
    return {
      values,
      namesError: 'Introduce polo menos un nome.',
    };
  }

  const repeatedNames = findRepeatedNames(names);

  if (repeatedNames.length > 0) {
    return {
      values,
      namesError: `Hai nomes repetidos na lista: ${repeatedNames.join(', ')}.`,
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [election] = await tx
        .select({ status: elections.status })
        .from(elections)
        .where(eq(elections.id, electionId))
        .for('update');

      if (!election) {
        return { type: 'missing' } as const;
      }

      if (election.status !== 'DRAFT') {
        return { type: 'notDraft' } as const;
      }

      const existingParticipants = await tx
        .select({ displayName: electionParticipants.displayName })
        .from(electionParticipants)
        .where(eq(electionParticipants.electionId, electionId));
      const existingNames = new Set(
        existingParticipants.map(({ displayName }) =>
          normalizeName(displayName),
        ),
      );
      const conflictingNames = names.filter((name) =>
        existingNames.has(normalizeName(name)),
      );

      if (conflictingNames.length > 0) {
        return { type: 'conflict', names: conflictingNames } as const;
      }

      await tx.insert(electionParticipants).values(
        names.map((displayName) => ({
          electionId,
          displayName,
          canVote: values.canVote,
          canBeCandidate: values.canBeCandidate,
        })),
      );

      return { type: 'success' } as const;
    });

    if (result.type === 'missing' || result.type === 'notDraft') {
      return { values, formError: mutationError(result.type) };
    }

    if (result.type === 'conflict') {
      return {
        values,
        namesError: `Xa hai persoas no censo con estes nomes: ${result.names.join(', ')}.`,
      };
    }

    revalidatePath(`/admin/elections/${electionId}`);

    return {
      values: {
        names: '',
        canVote: true,
        canBeCandidate: true,
      },
      successMessage: `${names.length} ${names.length === 1 ? 'persoa engadida' : 'persoas engadidas'}.`,
    };
  } catch (error) {
    logUnexpected('Participant import', error);
    return { values, formError: GENERIC_ERROR };
  }
}

export async function updateParticipantRoles(
  _previousState: ParticipantMutationState,
  formData: FormData,
): Promise<ParticipantMutationState> {
  await requireAdminSession();

  const electionId = readString(formData, 'electionId');
  const participantId = readString(formData, 'participantId');

  if (!UUID_PATTERN.test(electionId) || !UUID_PATTERN.test(participantId)) {
    return { formError: PARTICIPANT_NOT_FOUND_ERROR };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [election] = await tx
        .select({ status: elections.status })
        .from(elections)
        .where(eq(elections.id, electionId))
        .for('update');

      if (!election) {
        return 'missing' as const;
      }

      if (election.status !== 'DRAFT') {
        return 'notDraft' as const;
      }

      const [participant] = await tx
        .select({ id: electionParticipants.id })
        .from(electionParticipants)
        .where(
          and(
            eq(electionParticipants.id, participantId),
            eq(electionParticipants.electionId, electionId),
          ),
        );

      if (!participant) {
        return 'participantMissing' as const;
      }

      await tx
        .update(electionParticipants)
        .set({
          canVote: readChecked(formData, 'canVote'),
          canBeCandidate: readChecked(formData, 'canBeCandidate'),
        })
        .where(
          and(
            eq(electionParticipants.id, participantId),
            eq(electionParticipants.electionId, electionId),
          ),
        );

      return 'success' as const;
    });

    if (result === 'missing' || result === 'notDraft') {
      return { formError: mutationError(result) };
    }

    if (result === 'participantMissing') {
      return { formError: PARTICIPANT_NOT_FOUND_ERROR };
    }

    revalidatePath(`/admin/elections/${electionId}`);
    return { successMessage: 'Cambios gardados.' };
  } catch (error) {
    logUnexpected('Participant role update', error);
    return { formError: GENERIC_ERROR };
  }
}

export async function markAllParticipantsEligible(
  _previousState: ParticipantMutationState,
  formData: FormData,
): Promise<ParticipantMutationState> {
  await requireAdminSession();

  const electionId = readString(formData, 'electionId');

  if (!UUID_PATTERN.test(electionId)) {
    return { formError: ELECTION_NOT_FOUND_ERROR };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [election] = await tx
        .select({ status: elections.status })
        .from(elections)
        .where(eq(elections.id, electionId))
        .for('update');

      if (!election) {
        return 'missing' as const;
      }

      if (election.status !== 'DRAFT') {
        return 'notDraft' as const;
      }

      await tx
        .update(electionParticipants)
        .set({ canVote: true, canBeCandidate: true })
        .where(eq(electionParticipants.electionId, electionId));

      return 'success' as const;
    });

    if (result !== 'success') {
      return { formError: mutationError(result) };
    }

    revalidatePath(`/admin/elections/${electionId}`);
    return { successMessage: 'Todo o censo pode votar e ser candidato.' };
  } catch (error) {
    logUnexpected('Bulk participant role update', error);
    return { formError: GENERIC_ERROR };
  }
}

export async function deleteParticipant(
  _previousState: ParticipantMutationState,
  formData: FormData,
): Promise<ParticipantMutationState> {
  await requireAdminSession();

  const electionId = readString(formData, 'electionId');
  const participantId = readString(formData, 'participantId');

  if (!UUID_PATTERN.test(electionId) || !UUID_PATTERN.test(participantId)) {
    return { formError: PARTICIPANT_NOT_FOUND_ERROR };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [election] = await tx
        .select({ status: elections.status })
        .from(elections)
        .where(eq(elections.id, electionId))
        .for('update');

      if (!election) {
        return 'missing' as const;
      }

      if (election.status !== 'DRAFT') {
        return 'notDraft' as const;
      }

      const [deletedParticipant] = await tx
        .delete(electionParticipants)
        .where(
          and(
            eq(electionParticipants.id, participantId),
            eq(electionParticipants.electionId, electionId),
          ),
        )
        .returning({ id: electionParticipants.id });

      return deletedParticipant ? ('success' as const) : ('participantMissing' as const);
    });

    if (result === 'missing' || result === 'notDraft') {
      return { formError: mutationError(result) };
    }

    if (result === 'participantMissing') {
      return { formError: PARTICIPANT_NOT_FOUND_ERROR };
    }

    revalidatePath(`/admin/elections/${electionId}`);
    return { successMessage: 'Persoa eliminada.' };
  } catch (error) {
    logUnexpected('Participant deletion', error);
    return { formError: GENERIC_ERROR };
  }
}

export async function prepareElection(
  _previousState: PrepareElectionState,
  formData: FormData,
): Promise<PrepareElectionState> {
  await requireAdminSession();

  const electionId = readString(formData, 'electionId');

  if (!UUID_PATTERN.test(electionId)) {
    return { formError: ELECTION_NOT_FOUND_ERROR };
  }

  try {
    const result = await db.transaction((tx) =>
      transitionDraftElectionToReady(tx, electionId),
    );

    if (result.type === 'missing') {
      return { formError: ELECTION_NOT_FOUND_ERROR };
    }

    if (result.type === 'notDraft') {
      return { formError: PREPARATION_DRAFT_REQUIRED_ERROR };
    }

    if (result.type === 'notReady') {
      revalidatePath(`/admin/elections/${electionId}`);
      return { formError: NOT_READY_ERROR };
    }

    revalidatePath(`/admin/elections/${electionId}`);
    revalidatePath('/admin');

    return {};
  } catch (error) {
    logUnexpected('Election preparation', error);
    return { formError: GENERIC_ERROR };
  }
}

export async function openElection(
  _previousState: ElectionLifecycleActionState,
  formData: FormData,
): Promise<ElectionLifecycleActionState> {
  await requireAdminSession();

  const electionId = readString(formData, 'electionId');
  const closesAt = readString(formData, 'closesAt');

  if (!UUID_PATTERN.test(electionId)) {
    return { formError: ELECTION_NOT_FOUND_ERROR };
  }

  try {
    const result = await db.transaction((tx) =>
      transitionReadyElectionToOpen(tx, electionId, closesAt),
    );

    if (result.type === 'missing') {
      return { formError: ELECTION_NOT_FOUND_ERROR };
    }

    if (result.type === 'notReady') {
      return { formError: OPENING_READY_REQUIRED_ERROR };
    }

    if (result.type === 'invalidClosesAt') {
      return { formError: INVALID_CLOSING_DATE_ERROR };
    }

    if (result.type === 'closesAtNotFuture') {
      return { formError: CLOSING_DATE_NOT_FUTURE_ERROR };
    }

    if (result.type === 'noVoters') {
      return { formError: OPENING_NO_VOTERS_ERROR };
    }

    if (result.type === 'votersHaveVoted') {
      return {
        formError:
          result.voterCount === 1
            ? 'A votación non se pode abrir porque unha persoa figura como xa votada.'
            : `A votación non se pode abrir porque ${result.voterCount} persoas figuran como xa votadas.`,
      };
    }

    if (result.type === 'missingActiveCredentials') {
      return {
        formError:
          result.voterCount === 1
            ? 'Falta 1 persoa por ter unha ligazón activa.'
            : `Faltan ${result.voterCount} persoas por ter unha ligazón activa.`,
      };
    }

    revalidatePath(`/admin/elections/${electionId}`);
    revalidatePath('/admin');

    return {};
  } catch (error) {
    logUnexpected('Election opening', error);
    return { formError: GENERIC_ERROR };
  }
}

export async function closeElection(
  _previousState: ElectionLifecycleActionState,
  formData: FormData,
): Promise<ElectionLifecycleActionState> {
  await requireAdminSession();

  const electionId = readString(formData, 'electionId');

  if (!UUID_PATTERN.test(electionId)) {
    return { formError: ELECTION_NOT_FOUND_ERROR };
  }

  try {
    const result = await db.transaction((tx) =>
      transitionOpenElectionToClosed(tx, electionId),
    );

    if (result.type === 'missing') {
      return { formError: ELECTION_NOT_FOUND_ERROR };
    }

    if (result.type === 'notOpen') {
      return { formError: CLOSING_OPEN_REQUIRED_ERROR };
    }

    revalidatePath(`/admin/elections/${electionId}`);
    revalidatePath('/admin');

    return {};
  } catch (error) {
    logUnexpected('Election closing', error);
    return { formError: GENERIC_ERROR };
  }
}

export async function generateVotingLinks(
  electionId: string,
): Promise<VotingLinkActionResult> {
  await requireAdminSession();

  if (!UUID_PATTERN.test(electionId)) {
    return { formError: ELECTION_NOT_FOUND_ERROR };
  }

  try {
    const result = await generateMissingVotingCredentials(electionId);

    if (result.type === 'missingElection') {
      return { formError: ELECTION_NOT_FOUND_ERROR };
    }

    if (result.type === 'notReady') {
      return { formError: VOTING_LINKS_READY_REQUIRED_ERROR };
    }

    if (result.type === 'noEligibleVoters') {
      return {
        successMessage:
          'Non hai persoas pendentes de votar para as que xerar ligazóns.',
      };
    }

    if (result.type === 'allHaveActiveCredential') {
      return {
        successMessage:
          'Todas as persoas pendentes de votar xa teñen unha ligazón activa.',
      };
    }

    revalidatePath(`/admin/elections/${electionId}`);

    return {
      generatedLinks: result.generatedLinks,
      successMessage: `${result.generatedLinks.length} ${result.generatedLinks.length === 1 ? 'ligazón xerada' : 'ligazóns xeradas'}.`,
    };
  } catch (error) {
    logUnexpected('Bulk voting credential generation', error);
    return { formError: GENERIC_ERROR };
  }
}

export async function regenerateVotingLink(
  electionId: string,
  participantId: string,
): Promise<VotingLinkActionResult> {
  await requireAdminSession();

  if (!UUID_PATTERN.test(electionId)) {
    return { formError: ELECTION_NOT_FOUND_ERROR };
  }

  if (!UUID_PATTERN.test(participantId)) {
    return { formError: VOTER_NOT_FOUND_ERROR };
  }

  try {
    const result = await regenerateVotingCredential(
      electionId,
      participantId,
    );

    if (result.type === 'missingElection') {
      return { formError: ELECTION_NOT_FOUND_ERROR };
    }

    if (result.type === 'notRegenerable') {
      return { formError: VOTING_LINKS_REGENERATION_STATUS_ERROR };
    }

    if (result.type === 'missingClosesAt') {
      return { formError: VOTING_LINKS_MISSING_DEADLINE_ERROR };
    }

    if (result.type === 'closesAtPassed') {
      return { formError: VOTING_LINKS_DEADLINE_PASSED_ERROR };
    }

    if (
      result.type === 'missingParticipant' ||
      result.type === 'cannotVote'
    ) {
      return { formError: VOTER_NOT_FOUND_ERROR };
    }

    if (result.type === 'hasVoted') {
      return { formError: VOTER_HAS_VOTED_ERROR };
    }

    revalidatePath(`/admin/elections/${electionId}`);

    return {
      generatedLinks: [result.generatedLink],
      successMessage: 'Nova ligazón xerada.',
    };
  } catch (error) {
    logUnexpected('Individual voting credential generation', error);
    return { formError: GENERIC_ERROR };
  }
}
