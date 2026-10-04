import { describe, expect, it } from 'vitest';
import type { MarketSeries } from '../../shared/types';
import { buildUsTreasuryContext, usTreasuryHeroMove } from './us-treasury-context';

function series(key: string, value: number | null, changes: Record<string, number | null>, overrides: Partial<MarketSeries> = {}): MarketSeries {
  const today = new Date().toISOString().slice(0, 10);
  return { key, value, unit: '%', observationDate: today, sourceTimestamp: today, source: 'FRED', sourceUrl: 'https://fred.stlouisfed.org', status: 'ok', changes, history: [], ...overrides };
}

function context(nominal: Record<string, number | null>, real: Record<string, number | null>, breakeven: Record<string, number | null>, overrides: Partial<{ nominal: Partial<MarketSeries>; real: Partial<MarketSeries>; breakeven: Partial<MarketSeries>; curve: Partial<MarketSeries> }> = {}) {
  return buildUsTreasuryContext({
    nominal10y: series('us_10y_nominal', 4.3, nominal, overrides.nominal),
    real10y: series('us_10y_real', 2, real, overrides.real),
    breakeven10y: series('us_10y_breakeven', 2.3, breakeven, overrides.breakeven),
    curve2s10s: series('us_2s10s', 25, {}, overrides.curve),
  });
}

describe('deterministic U.S. Treasury interpretation', () => {
  it('classifies falling, rising, mixed and insufficient yield trends', () => {
    const falling = context({ '5dBp': -8, '20dBp': -12, '60dBp': -20 }, { '5dBp': -7, '20dBp': -10, '60dBp': -15 }, { '5dBp': 0, '20dBp': 0, '60dBp': 0 });
    expect(falling.nominal10yTrend).toBe('falling');
    expect(falling.overallLabel).toBe('תומך באג״ח');
    const rising = context({ '5dBp': 8, '20dBp': 12, '60dBp': 20 }, { '5dBp': 7, '20dBp': 10, '60dBp': 15 }, { '5dBp': 0, '20dBp': 0, '60dBp': 0 });
    expect(rising.nominal10yTrend).toBe('rising');
    expect(rising.overallLabel).toBe('לוחץ על אג״ח');
    expect(rising.explanation).toContain('אחרי התאמה לציפיות אינפלציה');
    expect(context({ '5dBp': 8, '20dBp': -12, '60dBp': 20 }, { '5dBp': 7, '20dBp': 10, '60dBp': -15 }, { '5dBp': 4, '20dBp': 5, '60dBp': -7 }).nominal10yTrend).toBe('mixed');
    expect(context({ '5dBp': null, '20dBp': 12, '60dBp': null }, { '5dBp': -7, '20dBp': -10, '60dBp': -15 }, { '5dBp': 0, '20dBp': 0, '60dBp': 0 }).nominal10yTrend).toBe('insufficient');
  });

  it('distinguishes breakeven changes and suppresses interpretation when stale', () => {
    expect(context({ '5dBp': 8, '20dBp': 12, '60dBp': 20 }, { '5dBp': 1, '20dBp': 1, '60dBp': 1 }, { '5dBp': 5, '20dBp': 6, '60dBp': 8 }).inflationTrend).toBe('rising');
    const stale = context({ '5dBp': -8, '20dBp': -12, '60dBp': -20 }, { '5dBp': -7, '20dBp': -10, '60dBp': -15 }, { '5dBp': -5, '20dBp': -6, '60dBp': -8 }, { nominal: { observationDate: '2020-01-01' } });
    expect(stale.overallLabel).toBe('אין מספיק נתונים');
    expect(stale.explanation).toContain('אינם עדכניים מספיק');
    expect(usTreasuryHeroMove(series('us_10y_nominal', 4, { '20dBp': 35 }, { observationDate: '2020-01-01' }))).toBeNull();
  });

  it('describes simultaneous nominal and breakeven increases cautiously', () => {
    const mixed = context({ '5dBp': 8, '20dBp': 12, '60dBp': 20 }, { '5dBp': 0, '20dBp': 1, '60dBp': -1 }, { '5dBp': 5, '20dBp': 6, '60dBp': 8 });
    expect(mixed.explanation).toContain('ייתכן שחלק מהשינוי קשור');
    expect(mixed.explanation).not.toMatch(/נגרם בוודאות|גורם בהכרח/);
    expect(mixed.explanation).not.toMatch(/לקנות|למכור|מומלץ|כדאי/);
    expect(usTreasuryHeroMove(series('us_10y_nominal', 4, { '20dBp': 30 }))).toEqual({ direction: 'rising', changeBps: 30 });
  });
});
