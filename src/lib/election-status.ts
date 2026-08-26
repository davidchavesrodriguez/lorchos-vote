import type { elections } from '@/db/schema';

type ElectionStatus = typeof elections.$inferSelect.status;

const ELECTION_STATUS_LABELS: Record<ElectionStatus, string> = {
  DRAFT: 'Borrador',
  READY: 'Preparada',
  OPEN: 'Aberta',
  CLOSED: 'Pechada',
};

export function getElectionStatusLabel(status: ElectionStatus): string {
  return ELECTION_STATUS_LABELS[status];
}
