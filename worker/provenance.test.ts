import { describe, expect, it } from 'vitest';
import type { Signal } from '../shared/types';
import { __test } from './index';

describe('active U.S. yield provenance', () => {
  it('attributes the Israel-U.S. real-yield differential to BOI and U.S. Treasury without changing its value', () => {
    const signal: Signal = {
      key: 'il_us_real_yield_differential', nameHe: 'פער תשואות ריאליות', status: 'yellow', score: 0,
      value: { currentBps: 125, changeBps: -8 }, explanationHe: 'test', observationDate: '2026-10-02', weight: 0,
    };
    const market = __test.createRealYieldDifferential(125, signal, '2026-10-04T00:00:00.000Z');
    expect(market).toMatchObject({
      value: 125,
      source: 'בנק ישראל + U.S. Treasury',
      sourceUrl: expect.stringContaining('boi.org.il'),
      derived: true,
      changes: { changeBps: -8 },
      observationDate: '2026-10-02',
    });
    expect(market.sourceUrls).toEqual(expect.arrayContaining([
      expect.stringContaining('boi.org.il'),
      expect.stringContaining('home.treasury.gov'),
    ]));
    expect(market.provenance).toContain('תשואה ריאלית ל־10 שנים');
    expect(JSON.stringify(market)).not.toContain('FRED');
  });
});
