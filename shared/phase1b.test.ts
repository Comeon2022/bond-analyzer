import { describe, expect, it } from 'vitest';
import { buildChangeSummary, lookbackChange, lookbackPercentChange, riskConditionsProxy } from './phase1b';

describe('Phase 1B calculations', () => {
  it('classifies improving, deteriorating, and neutral risk conditions', () => {
    const green = riskConditionsProxy({ usdIls20dPercent: -2, israelRealYieldChangeBps: -15, realYieldDifferentialChangeBps: -15, usdIlsObservationDate: '2026-09-30', israelRealObservationDate: '2026-09-30', differentialObservationDate: '2026-09-30' }, { usdIlsPercent: 2, realYieldBps: 15, differentialBps: 15 });
    const red = riskConditionsProxy({ usdIls20dPercent: 2, israelRealYieldChangeBps: 15, realYieldDifferentialChangeBps: 15, usdIlsObservationDate: null, israelRealObservationDate: null, differentialObservationDate: null }, { usdIlsPercent: 2, realYieldBps: 15, differentialBps: 15 });
    const neutral = riskConditionsProxy({ usdIls20dPercent: 0, israelRealYieldChangeBps: 0, realYieldDifferentialChangeBps: 0, usdIlsObservationDate: null, israelRealObservationDate: null, differentialObservationDate: null }, { usdIlsPercent: 2, realYieldBps: 15, differentialBps: 15 });
    expect(green.status).toBe('green');
    expect(red.status).toBe('red');
    expect(neutral.status).toBe('yellow');
    expect(neutral.value).toBe(0);
    const differential = green.components.find((component) => component.key === 'realYieldDifferentialChange')!;
    expect(differential.source).toBe('בנק ישראל + U.S. Treasury');
    expect(differential.sourceUrls).toContain('https://home.treasury.gov/resource-center/data-chart-center/interest-rates');
    expect(JSON.stringify(green)).not.toContain('FRED');
    expect(green.components.map((component) => component.value)).toEqual([-2, -15, -15]);
  });

  it('uses available proxy components only and reports proxy coverage', () => {
    const partial = riskConditionsProxy({ usdIls20dPercent: -3, israelRealYieldChangeBps: null, realYieldDifferentialChangeBps: 15, usdIlsObservationDate: '2026-09-30', israelRealObservationDate: null, differentialObservationDate: '2026-09-30' }, { usdIlsPercent: 2, realYieldBps: 15, differentialBps: 15 });
    const empty = riskConditionsProxy({ usdIls20dPercent: null, israelRealYieldChangeBps: null, realYieldDifferentialChangeBps: null, usdIlsObservationDate: null, israelRealObservationDate: null, differentialObservationDate: null }, { usdIlsPercent: 2, realYieldBps: 15, differentialBps: 15 });
    expect(partial.value).toBe(0);
    expect(partial.coverage).toBeCloseTo(2 / 3);
    expect(empty.status).toBe('unknown');
    expect(empty.value).toBeNull();
  });

  it('builds deterministic change bullets from only available observations', () => {
    const changed=buildChangeSummary({israelRealYieldChangeBps:12.3,usdIls20dPercent:null,inflationExpectationChange:-0.1,usNominal5dBps:null});
    expect(changed.bullets).toHaveLength(2); expect(changed.bullets[0]).toBe('\u05e9\u05d9\u05e0\u05d5\u05d9 \u05d1\u05ea\u05e9\u05d5\u05d0\u05d4 \u05d4\u05e8\u05d9\u05d0\u05dc\u05d9\u05ea \u05d4\u05d9\u05e9\u05e8\u05d0\u05dc\u05d9\u05ea: 12.3 \u05e0\u05f4\u05d1.'); expect(changed.bullets[1]).toContain('\u05e9\u05d9\u05e0\u05d5\u05d9'); expect(changed.summary).toContain('\u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd');
    const missing=buildChangeSummary({israelRealYieldChangeBps:null,usdIls20dPercent:null,inflationExpectationChange:null,usNominal5dBps:null}); expect(missing.bullets).toEqual([]); expect(missing.summary).toBe('\u05de\u05de\u05ea\u05d9\u05df \u05dc\u05ea\u05e6\u05e4\u05d9\u05d5\u05ea \u05de\u05d0\u05d5\u05de\u05ea\u05d5\u05ea \u05dc\u05d4\u05e9\u05d5\u05d5\u05d0\u05d4.');
    const move=buildChangeSummary({israelRealYieldChangeBps:null,usdIls20dPercent:null,inflationExpectationChange:null,usNominal5dBps:null,bondSpreadChanges:[{issuerHe:'\u05e0\u05de\u05dc\u05d9 \u05d9\u05e9\u05e8\u05d0\u05dc',seriesName:'D',changeBp:-6,thresholdBp:5},{issuerHe:'IEC',seriesName:'37',changeBp:2,thresholdBp:5}]}); expect(move.bullets).toHaveLength(1); expect(move.bullets[0]).toContain('\u05de\u05e8\u05d5\u05d5\u05d7');
  });

  it('computes business-session lookbacks across date gaps and refuses short histories', () => {
    const rows = [
      { date: '2026-09-21', value: 100 }, { date: '2026-09-22', value: 101 },
      { date: '2026-09-24', value: 102 }, { date: '2026-09-25', value: 103 },
      { date: '2026-09-28', value: 105 }, { date: '2026-09-29', value: 106 },
    ];
    expect(lookbackChange(rows, 5)).toBe(6);
    expect(lookbackPercentChange(rows, 5)).toBe(6);
    expect(lookbackChange(rows.slice(0, 5), 5)).toBeNull();
  });
});
