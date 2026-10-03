import { describe, expect, it } from 'vitest';
import type { CreditSummaryResponse } from './api-types';
import { normalizeCreditOutlookContext } from './credit-outlook';

function summary(status: CreditSummaryResponse['sourceStatus']['status'], stale = false): CreditSummaryResponse {
  return {
    seriesCount: 3,
    latestCommonObservationPeriod: '2026-09',
    widestCurrentSpread: { seriesCode: 'live-code', label: 'official metadata', value: 2.4, timePeriod: '2026-09' },
    narrowestCurrentSpread: null,
    largest3mWidening: { seriesCode: 'live-code', label: 'official metadata', changeBp: 28 },
    largest3mNarrowing: { seriesCode: 'live-code-2', label: 'official metadata', changeBp: -30 },
    coverage: { seriesWithData: 3, seriesWithoutData: 0, metadataResolvedSeries: 3, metadataUnresolvedSeries: 0 },
    sourceStatus: {
      name: 'BOI SECDWH corporate spreads', sourceUrl: 'https://example.invalid/data', sourcePage: 'https://example.invalid/page',
      lastSuccessAt: '2026-10-03T10:00:00.000Z', lastErrorAt: null, lastError: null, latestObservationPeriod: '2026-09',
      observationCount: 72, seriesCount: 3, stale, status,
    },
    changes: { bullets: [] },
  };
}

describe('credit outlook context normalization', () => {
  it('maps only compact aggregate fields and marks fresh data available', () => {
    expect(normalizeCreditOutlookContext(summary('healthy'))).toEqual({
      available: true, stale: false, latestPeriod: '2026-09', seriesCount: 3,
      largest3mWideningBp: 28, largest3mNarrowingBp: -30,
    });
  });

  it('never treats stale or errored API data as current evidence', () => {
    expect(normalizeCreditOutlookContext(summary('stale', true))?.stale).toBe(true);
    expect(normalizeCreditOutlookContext(summary('error'))?.stale).toBe(true);
    expect(normalizeCreditOutlookContext(null)).toBeNull();
  });

  it('marks summaries without a current common period unavailable', () => {
    const value = summary('healthy');
    value.latestCommonObservationPeriod = null;
    const normalized = normalizeCreditOutlookContext(value);
    expect(normalized?.available).toBe(false);
    expect(normalized?.stale).toBe(false);
  });
});
