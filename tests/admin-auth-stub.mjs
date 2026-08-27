const state = {
  session: null,
  sessionChecks: 0,
};

export const auth = {
  api: {
    async getSession() {
      state.sessionChecks += 1;
      return state.session;
    },
  },
};

export async function headers() {
  return new Headers();
}

export function setAdminTestSession(session) {
  state.session = session;
  state.sessionChecks = 0;
}

export function getAdminTestSessionChecks() {
  return state.sessionChecks;
}
