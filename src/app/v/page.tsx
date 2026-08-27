import type { Metadata } from 'next';

import { VotingBootstrap } from './voting-bootstrap';

export const metadata: Metadata = {
  title: 'Votación | GB Lorchos',
  robots: {
    index: false,
    follow: false,
  },
};

export default function PublicVotingBootstrapPage() {
  return <VotingBootstrap />;
}
