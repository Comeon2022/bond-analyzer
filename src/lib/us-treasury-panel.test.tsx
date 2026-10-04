import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MarketSeries } from '../../shared/types';
import { UsTreasuryPanel } from '../App';

function sample(key: string, value: number | null, unit = '%'): MarketSeries {
  const today = new Date().toISOString().slice(0, 10);
  return {
    key, value, unit, observationDate: today, sourceTimestamp: today, source: 'U.S. Treasury',
    sourceUrl: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates', status: 'ok',
    changes: { '1dBp': 1, '5dBp': 8, '20dBp': 12, '60dBp': 20 },
    history: Array.from({ length: 250 }, (_, index) => ({ observationDate: new Date(Date.now() - (249 - index) * 86_400_000).toISOString().slice(0, 10), value: (value ?? 0) - (249 - index) / 1000, ingestedAt: today, sourceTimestamp: today })),
  };
}

describe('U.S. Treasury context panel', () => {
  it('shows four primary market measures, bps changes, curve snapshot, and Israel context', () => {
    const breakeven = { ...sample('us_10y_breakeven', 2.3), derived: true, provenance: 'תשואה נומינלית ל־10 שנים פחות תשואה ריאלית ל־10 שנים' };
    const curve = { ...sample('us_2s10s', 30, 'bp'), derived: true, provenance: 'תשואה ל־10 שנים פחות תשואה ל־2 שנים' };
    const markets = { us2yNominal: sample('us_2y_nominal', 4), us10yNominal: sample('us_10y_nominal', 4.3), us10yReal: sample('us_10y_real', 2), us10yBreakeven: breakeven, us2s10s: curve };
    const html = renderToStaticMarkup(<UsTreasuryPanel markets={markets} />);
    for (const label of ['אג״ח ממשלת ארה״ב', 'תשואות, אינפלציה צפויה ועקום הריבית בארה״ב', 'תשואה ל־10 שנים', 'תשואה ריאלית ל־10 שנים', 'ציפיות אינפלציה ל־10 שנים', 'פער 2–10 שנים', '4.3%', '2%', '+30 נ״ב', 'עקום עולה', '1 נ״ב = 0.01 נקודת אחוז', 'למה זה חשוב לישראל?', '4%', '1M', '1Y']) expect(html).toContain(label);
    expect(html).not.toMatch(/לקנות|למכור|מומלץ|כדאי/);
    expect(html).toContain('מקור: U.S. Treasury');
    expect(html).toContain('מחושב מנתוני U.S. Treasury: תשואה נומינלית ל־10 שנים פחות תשואה ריאלית ל־10 שנים');
    expect(html).toContain('מקור: U.S. Treasury · מחושב: תשואה ל־10 שנים פחות תשואה ל־2 שנים');
  });

  it('shows explicit missing values and stale status without inventing observations', () => {
    const stale = sample('us_10y_nominal', null);
    stale.observationDate = '2020-01-01';
    stale.status = 'stale';
    const markets = { us2yNominal: stale, us10yNominal: stale, us10yReal: stale, us10yBreakeven: stale, us2s10s: stale };
    const html = renderToStaticMarkup(<UsTreasuryPanel markets={markets} />);
    expect(html).toContain('אין נתון זמין');
    expect(html).toContain('אין מספיק נתונים');
    expect(html).toContain('נתוני התשואות בארה״ב אינם עדכניים מספיק');
    expect(html).not.toContain('undefined%');
  });
});
