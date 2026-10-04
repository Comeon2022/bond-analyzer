import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MarketSeries } from '../../shared/types';
import { UsdIlsPanel, usdIlsMoveText } from '../App';
import {
  classifyUsdIlsTrend, usdIlsChartHistory, usdIlsDirection, usdIlsInterpretation, usdIlsIsFresh, usdIlsRange,
} from './usdils';

function sample(overrides: Partial<MarketSeries> = {}): MarketSeries {
  const today = new Date().toISOString().slice(0, 10);
  return {
    key: 'usd_ils', value: 3.62, unit: 'ILS', observationDate: today, sourceTimestamp: today,
    source: 'שער יציג — בנק ישראל', sourceUrl: 'https://www.boi.org.il/', status: 'ok',
    changes: { '1dPct': -0.1, '5dPct': -0.6, '20dPct': -1.8, '60dPct': -2.2 },
    history: Array.from({ length: 250 }, (_, index) => ({ observationDate: new Date(Date.now() - (249 - index) * 86_400_000).toISOString().slice(0, 10), value: 3.4 + index / 1000, ingestedAt: today, sourceTimestamp: today })),
    ...overrides,
  };
}

describe('deterministic USD/ILS interpretation', () => {
  it('translates rising and falling USD/ILS into the shekel perspective', () => {
    expect(usdIlsDirection(1)).toBe('weakened');
    expect(usdIlsDirection(-1)).toBe('strengthened');
    expect(usdIlsDirection(0.1)).toBe('unchanged');
    expect(usdIlsMoveText(1.8)).toContain('הדולר עלה 1.8% — השקל נחלש');
    expect(usdIlsMoveText(-1.8)).toContain('הדולר ירד 1.8% — השקל התחזק');
  });

  it('classifies aligned, conflicting, flat, and insufficient horizons deterministically', () => {
    expect(classifyUsdIlsTrend(sample())).toBe('strengthening');
    expect(classifyUsdIlsTrend(sample({ changes: { '5dPct': 0.5, '20dPct': -1, '60dPct': 0.8 } }))).toBe('mixed');
    expect(classifyUsdIlsTrend(sample({ changes: { '5dPct': 0.1, '20dPct': -0.2, '60dPct': 0.1 } }))).toBe('unclear');
    expect(classifyUsdIlsTrend(sample({ changes: { '5dPct': null, '20dPct': 1, '60dPct': null } }))).toBe('insufficient');
  });

  it('suppresses current interpretation for stale data and remains cautious for mixed movement', () => {
    const stale = sample({ observationDate: '2020-01-01' });
    expect(usdIlsIsFresh(stale)).toBe(false);
    expect(usdIlsInterpretation(classifyUsdIlsTrend(stale), false)).toBeNull();
    expect(usdIlsInterpretation('mixed', true)).toContain('אינה חד־כיוונית');
    expect(usdIlsInterpretation('weakening', true)).not.toMatch(/גורם ל|מעלה בוודאות/);
  });

  it('shows ranges and chart periods only when the corresponding history is available', () => {
    const history = sample().history;
    expect(usdIlsRange(history, 20)).not.toBeNull();
    expect(usdIlsRange(history.slice(0, 19), 20)).toBeNull();
    expect(usdIlsRange(history, 60)?.low).toBeLessThan(usdIlsRange(history, 60)!.high);
    expect(usdIlsChartHistory(history, 240)).toHaveLength(241);
    expect(usdIlsChartHistory(history.slice(0, 20), 20)).toBeNull();
  });

  it('renders all required horizons, snapshot context, and live values; stale data hides interpretation', () => {
    const html = renderToStaticMarkup(<UsdIlsPanel series={sample()} />);
    for (const label of ['דולר / שקל', 'שער הדולר מול השקל ומגמת השקל', 'השקל התחזק', 'מגמה: שקל מתחזק', 'שער נוכחי', 'יום', '5 ימי מסחר', '20 ימי מסחר', '60 ימי מסחר', '3.62', 'השקל התחזק בתקופה האחרונה']) expect(html).toContain(label);
    expect(html).toContain('1M');
    expect(html).toContain('1Y');
    expect(html).not.toMatch(/לקנות|למכור|מומלץ|כדאי/);
    const staleHtml = renderToStaticMarkup(<UsdIlsPanel series={sample({ observationDate: '2020-01-01' })} />);
    expect(staleHtml).toContain('נתון דולר/שקל אינו עדכני מספיק');
    expect(staleHtml).not.toContain('השקל התחזק בתקופה האחרונה');
    const emptyHtml = renderToStaticMarkup(<UsdIlsPanel series={sample({ history: [] })} />);
    expect(emptyHtml).toContain('אין מספיק היסטוריה להצגת טווח זה');
    expect(emptyHtml).not.toContain('1Y</button>');
  });
});
