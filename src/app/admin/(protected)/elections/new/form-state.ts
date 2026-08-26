export type ElectionFormValues = {
  title: string;
  groupLabel: string;
  numberOfWinners: string;
  minSelections: string;
  maxSelections: string;
  allowSelfVote: boolean;
  minimumTurnout: string;
};

export type ElectionFormField = keyof ElectionFormValues;

export type ElectionFormState = {
  values: ElectionFormValues;
  fieldErrors: Partial<Record<ElectionFormField, string>>;
  formError?: string;
};

export const initialElectionFormState: ElectionFormState = {
  values: {
    title: '',
    groupLabel: '',
    numberOfWinners: '1',
    minSelections: '1',
    maxSelections: '1',
    allowSelfVote: false,
    minimumTurnout: '',
  },
  fieldErrors: {},
};
