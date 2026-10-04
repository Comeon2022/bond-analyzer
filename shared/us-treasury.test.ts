import { describe, expect, it } from 'vitest';
import { classifyUs2s10s, deriveUs2s10s, usTreasuryChangesBps } from './us-treasury';

describe('U.S. Treasury yield transformations', () => {
  it('derives 2s10s only for matching observation dates', () => {
    const spread = deriveUs2s10s(
      [{ date: '2026-10-01', value: 4.2 }, { date: '2026-10-02', value: 4.3 }],
      [{ date: '2026-10-01', value: 4.0 }],
    );
    expect(spread).toEqual([{ date: '2026-10-01', value: 20 }]);
  });

  it('classifies normal, flat, inverted, and unavailable curve observations', () => {
    expect(classifyUs2s10s(75)).toBe('normal');
    expect(classifyUs2s10s(10)).toBe('flat');
    expect(classifyUs2s10s(-1)).toBe('inverted');
    expect(classifyUs2s10s(null)).toBe('insufficient');
  });

  it('reports business-observation yield changes in basis points', () => {
    const rows = Array.from({ length: 62 }, (_, index) => ({ date: `2026-01-${String(index + 1).padStart(2, '0')}`, value: 4 + index * 0.001 }));
    const changes = usTreasuryChangesBps(rows);
    expect(changes['1dBp']).toBe(0.1);
    expect(changes['5dBp']).toBe(0.5);
    expect(changes['60dBp']).toBe(6);
    const spreadChanges = usTreasuryChangesBps([{ date: '1', value: 5 }, { date: '2', value: 10 }], 1);
    expect(spreadChanges['1dBp']).toBe(5);
  });
});
