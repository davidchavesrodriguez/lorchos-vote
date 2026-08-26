import type { Metadata } from 'next';

import { resolvePublicVotingToken } from '@/lib/public-voting';
import styles from '../vote.module.css';
import { VoteFlow } from './vote-flow';

export const metadata: Metadata = {
  title: 'Votación | GB Lorchos',
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = 'force-dynamic';

type PublicVotingPageProps = {
  params: Promise<{ token: string }>;
};

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

export default async function PublicVotingPage({
  params,
}: PublicVotingPageProps) {
  const { token } = await params;
  const resolution = await resolvePublicVotingToken(token);

  if (resolution.type === 'available') {
    return (
      <VoteFlow
        token={token}
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
