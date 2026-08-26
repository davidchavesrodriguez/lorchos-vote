export type ParticipantImportState = {
  values: {
    names: string;
    canVote: boolean;
    canBeCandidate: boolean;
  };
  namesError?: string;
  formError?: string;
  successMessage?: string;
};

export type ParticipantMutationState = {
  formError?: string;
  successMessage?: string;
};

export const initialParticipantImportState: ParticipantImportState = {
  values: {
    names: '',
    canVote: true,
    canBeCandidate: true,
  },
};

export const initialParticipantMutationState: ParticipantMutationState = {};
