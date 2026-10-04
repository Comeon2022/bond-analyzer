import { describe, expect, it } from 'vitest';
import { __test } from './index';

describe('CBS CPI statistics', () => {
  const observation = (observation_date: string, value: number) => ({ observation_date, value, ingested_at: '2026-10-04T10:00:00.000Z', source_timestamp: null, revision_number: 1 });

  it('calculates annual and monthly inflation from actual 12-month and one-month observations', () => {
    const stats = __test.cpiStats([
      observation('2025-01-31', 100), observation('2025-02-28', 101), observation('2026-01-31', 102), observation('2026-02-28', 104),
    ]);
    expect(stats.latestIndex).toBe(104);
    expect(stats.mom).toBeCloseTo((104 / 102 - 1) * 100);
    expect(stats.yoy).toBeCloseTo((104 / 101 - 1) * 100);
    expect(stats.observationDate).toBe('2026-02-28');
  });

  it('does not interpolate missing months or present an incomplete year-over-year value', () => {
    const stats = __test.cpiStats([
      observation('2025-02-28', 100), observation('2026-03-31', 103),
    ]);
    expect(stats.mom).toBeNull();
    expect(stats.yoy).toBeNull();
  });

  it('returns only sanitized CBS ingestion summary fields for the protected manual-ingestion result', async () => {
    const run = { job_key: 'cbs_cpi', status: 'success', records_read: 240, records_written: 240, error_message: null, details_json: JSON.stringify({ formatUsed: 'xml', latestDate: '2026-08-31' }) };
    const db = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [run] }) }) }) } as unknown as D1Database;
    const sources = await __test.manualIngestionSources(db, '2026-10-04T10:00:00.000Z');
    expect(sources.cbsCpi).toMatchObject({ ok: true, formatUsed: 'xml', rowsRead: 240, rowsWritten: 240, latestDate: '2026-08-31' });
    const failed = { ...run, status: 'error', error_message: 'CBS_CPI_UNAVAILABLE', records_read: 0, records_written: 0, details_json: '{}' };
    const failedDb = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [failed] }) }) }) } as unknown as D1Database;
    const failedSources = await __test.manualIngestionSources(failedDb, '2026-10-04T10:00:00.000Z');
    expect(failedSources.cbsCpi).toMatchObject({ ok: false, formatUsed: null, rowsRead: 0, rowsWritten: 0, latestDate: null, failureKind: 'unavailable' });
    expect(JSON.stringify(failedSources)).not.toContain('CBS_CPI_UNAVAILABLE');
  });
});
