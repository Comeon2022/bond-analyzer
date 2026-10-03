import type { CreditOutlookContext } from '../../shared/outlook';
import type { CreditSummaryResponse } from './api-types';

export function normalizeCreditOutlookContext(summary: CreditSummaryResponse | null): CreditOutlookContext | null {
  if (!summary) return null;
  const latestPeriod = summary.latestCommonObservationPeriod;
  const available = summary.seriesCount > 0 && latestPeriod !== null;
  return {
    available,
    stale: available && (summary.sourceStatus.status !== 'healthy' || summary.sourceStatus.stale),
    latestPeriod,
    seriesCount: summary.seriesCount,
    largest3mWideningBp: summary.largest3mWidening?.changeBp ?? null,
    largest3mNarrowingBp: summary.largest3mNarrowing?.changeBp ?? null,
  };
}
