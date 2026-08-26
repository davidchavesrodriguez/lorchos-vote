'use server';

import { redirect } from 'next/navigation';

import { db } from '@/db';
import { elections } from '@/db/schema';
import { requireAdminSession } from '@/lib/admin-session';

import type {
  ElectionFormField,
  ElectionFormState,
  ElectionFormValues,
} from './form-state';

function readText(formData: FormData, field: ElectionFormField): string {
  const value = formData.get(field);

  return typeof value === 'string' ? value : '';
}

function parseInteger(value: string): number | null {
  const trimmedValue = value.trim();

  if (!/^[+-]?\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

export async function createElection(
  _previousState: ElectionFormState,
  formData: FormData,
): Promise<ElectionFormState> {
  await requireAdminSession();

  const values: ElectionFormValues = {
    title: readText(formData, 'title'),
    groupLabel: readText(formData, 'groupLabel'),
    numberOfWinners: readText(formData, 'numberOfWinners'),
    minSelections: readText(formData, 'minSelections'),
    maxSelections: readText(formData, 'maxSelections'),
    allowSelfVote: formData.get('allowSelfVote') === 'true',
    minimumTurnout: readText(formData, 'minimumTurnout'),
  };
  const fieldErrors: ElectionFormState['fieldErrors'] = {};
  const title = values.title.trim();
  const groupLabel = values.groupLabel.trim();
  const numberOfWinners = parseInteger(values.numberOfWinners);
  const minSelections = parseInteger(values.minSelections);
  const maxSelections = parseInteger(values.maxSelections);
  const minimumTurnout = values.minimumTurnout.trim()
    ? parseInteger(values.minimumTurnout)
    : null;

  if (!title) {
    fieldErrors.title = 'Introduce o nome da votación.';
  }

  if (!groupLabel) {
    fieldErrors.groupLabel = 'Introduce o grupo da votación.';
  }

  if (numberOfWinners === null || numberOfWinners <= 0) {
    fieldErrors.numberOfWinners =
      'O número de gañadores debe ser un enteiro maior ca cero.';
  }

  if (minSelections === null || minSelections <= 0) {
    fieldErrors.minSelections =
      'As seleccións mínimas deben ser un enteiro maior ca cero.';
  }

  if (
    maxSelections === null ||
    minSelections === null ||
    maxSelections < minSelections
  ) {
    fieldErrors.maxSelections =
      'As seleccións máximas deben ser iguais ou superiores ás mínimas.';
  }

  if (
    values.minimumTurnout.trim() &&
    (minimumTurnout === null || minimumTurnout <= 0)
  ) {
    fieldErrors.minimumTurnout =
      'A participación mínima debe ser un enteiro maior ca cero.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { values, fieldErrors };
  }

  let electionId: string;

  try {
    const [election] = await db
      .insert(elections)
      .values({
        title,
        groupLabel,
        status: 'DRAFT',
        numberOfWinners: numberOfWinners!,
        minSelections: minSelections!,
        maxSelections: maxSelections!,
        allowSelfVote: values.allowSelfVote,
        minimumTurnout,
      })
      .returning({ id: elections.id });

    if (!election) {
      throw new Error('Election insert returned no row');
    }

    electionId = election.id;
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error(`Election creation failed (${errorName})`);

    return {
      values,
      fieldErrors: {},
      formError:
        'Non foi posible crear a votación. Téntao de novo dentro duns intres.',
    };
  }

  redirect(`/admin/elections/${electionId}`);
}
