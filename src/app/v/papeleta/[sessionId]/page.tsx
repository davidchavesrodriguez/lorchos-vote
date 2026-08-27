import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { resolvePublicVotingCredential } from '@/lib/public-voting';
import {
  getVotingSessionCookieName,
  hasValidVotingSessionIdStructure,
  verifyVotingSession,
} from '@/lib/voting-session';
import styles from '../../vote.module.css';
import { VoteFlow } from '../../vote-flow';

export const metadata: Metadata = {
  title: 'Votación | GB Lorchos',
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = 'force-dynamic';

const STATUS_MESSAGES = {
  invalid: 'Esta ligazón non é válida.',
  revoked:
    'Esta ligazón foi substituída e xa non é válida. Pide unha nova ao club.',
  used: 'O voto asociado a esta ligazón xa foi emitido.',
  ready: 'A votación aínda non está aberta.',
  closed: 'A votación está pechada.',
  deadlinePassed: 'O prazo de votación rematou.',
  unavailable: 'A votación non está dispoñible neste momento.',
} as const;

function MissingVotingSession() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <p className={styles.brand}>GB Lorchos · Votación</p>
        <section className={styles.status} aria-labelledby='status-title'>
          <h1 id='status-title' className={styles.title}>
            Estado da votación
          </h1>
          <p className={styles.statusMessage} role='status'>
            Abre a ligazón de voto que recibiches.
          </p>
        </section>
      </div>
    </main>
  );
}

type PublicBallotPageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function PublicBallotPage({
  params,
}: PublicBallotPageProps) {
  const { sessionId } = await params;

  if (!hasValidVotingSessionIdStructure(sessionId)) {
    return <MissingVotingSession />;
  }

  const cookieStore = await cookies();
  const cookieName = getVotingSessionCookieName(sessionId);
  const signedSession = cookieStore.get(cookieName)?.value;
  const session = signedSession
    ? verifyVotingSession(signedSession, sessionId)
    : null;

  if (!session) {
    return <MissingVotingSession />;
  }

  const resolution = await resolvePublicVotingCredential(
    session.credentialId,
  );

  if (resolution.type === 'available') {
    return (
      <VoteFlow
        sessionId={sessionId}
        electionTitle={resolution.electionTitle}
        groupLabel={resolution.groupLabel}
        voterDisplayName={resolution.voterDisplayName}
        minSelections={resolution.minSelections}
        maxSelections={resolution.maxSelections}
        closesAt={resolution.closesAt}
        candidates={resolution.candidates}
      />
    );
  }

  const hasActiveContext =
    resolution.type === 'ready' ||
    resolution.type === 'closed' ||
    resolution.type === 'deadlinePassed' ||
    resolution.type === 'unavailable';

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <p className={styles.brand}>GB Lorchos · Votación</p>
        <section className={styles.status} aria-labelledby='status-title'>
          <h1 id='status-title' className={styles.title}>
            {hasActiveContext ? resolution.electionTitle : 'Estado da votación'}
          </h1>
          {hasActiveContext ? (
            <>
              <p className={styles.group}>{resolution.groupLabel}</p>
              <div className={styles.linkIdentity}>
                <p>
                  Esta ligazón corresponde a{' '}
                  <strong>{resolution.voterDisplayName}</strong>.
                </p>
                <p>Se non es ti, non votes con esta ligazón e avisa ao club.</p>
              </div>
            </>
          ) : null}
          <p className={styles.statusMessage} role='status'>
            {STATUS_MESSAGES[resolution.type]}
          </p>
        </section>
      </div>
    </main>
  );
}
