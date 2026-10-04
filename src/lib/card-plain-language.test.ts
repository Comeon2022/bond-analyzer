import { describe, expect, it } from 'vitest';
import { getCoreCardSummary } from './card-plain-language';

describe('deterministic plain-language core card summaries', () => {
  it('provides concise state-specific Hebrew for all core metrics', () => {
    const cards = [
      { key: 'policy_rate', status: 'green', value: 4.5 },
      { key: 'cpi_inflation', status: 'green', value: 2.4 },
      { key: 'inflation_expectations', status: 'yellow', value: 2.7 },
      { key: 'israel_risk_proxy', status: 'red', value: -0.4 },
      { key: 'long_real_yield', status: 'green', value: 1.2 },
      { key: 'long_yield_momentum', status: 'red', value: 12 },
    ] as const;
    const summaries = cards.map((card) => getCoreCardSummary(card));
    expect(summaries[0]).toContain('בנק ישראל הוריד ריבית');
    expect(summaries[1]).toContain('האינפלציה השנתית 2.4%');
    expect(summaries[2]).toContain('ציפיות השוק למחירים');
    expect(summaries[3]).toContain('הסיכון המקומי הורע');
    expect(summaries[4]).toContain('התשואה הריאלית ל־10 שנים ירדה');
    expect(summaries[5]).toContain('התשואות הארוכות עלו');
    expect(summaries.every((summary) => summary.length <= 180)).toBe(true);
    expect(summaries.join(' ')).not.toMatch(/לקנות|למכור|מומלץ|כדאי/);
  });

  it('uses explicit, metric-specific copy when values are unavailable', () => {
    expect(getCoreCardSummary({ key: 'cpi_inflation', status: 'unknown', value: null })).toBe('עדיין אין לנו נתון שנתי עדכני, ולכן קשה לקבוע אם האינפלציה תומכת באג״ח.');
    expect(getCoreCardSummary({ key: 'policy_rate', status: 'unknown', value: null })).toContain('אין מספיק נתוני ריבית עדכניים');
    expect(getCoreCardSummary({ key: 'inflation_expectations', status: 'unknown', value: null })).toContain('אין מספיק נתונים עדכניים');
  });
});
