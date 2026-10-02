import { describe, expect, it } from 'vitest';
import { buildOutlookSummary, type OutlookInput } from './outlook';

function input(statuses: Record<string, 'green' | 'yellow' | 'red' | 'unknown'>, coveragePct = 100, regimeStatus: OutlookInput['regime']['status'] = 'green'): OutlookInput {
  return {
    regime: { status: regimeStatus, score: regimeStatus === 'unknown' ? null : 0.5, coveragePct },
    signals: Object.entries(statuses).map(([key, status]) => ({ key, status })),
  };
}

const positive = {
  policy_rate: 'green', cpi_inflation: 'green', inflation_expectations: 'green',
  long_real_yield: 'yellow', long_yield_momentum: 'yellow', israel_risk_proxy: 'green',
} as const;

describe('deterministic Hebrew outlook interpretation', () => {
  it('builds a positive-moderate base case from aligned supportive signals', () => {
    const outlook = buildOutlookSummary(input(positive));
    expect(outlook.overallLabel).toBe('סביבה חיובית מתונה');
    expect(outlook.baseCaseText).toBe('בתרחיש הבסיס בשבועות ובחודשים הקרובים, האיתותים עשויים להמשיך לתמוך בסביבה חיובית מתונה, אם מגמת האינפלציה והריבית תישאר דומה; התשואות הארוכות עדיין דורשות מעקב.');
    expect(outlook.conclusionBullets).toHaveLength(3);
    expect(outlook.riskTriggerBullets).toHaveLength(3);
    expect(outlook.confidenceLabel).toBe('ביטחון גבוה יחסית');
  });

  it('describes a mixed regime when key signals conflict or are unclear', () => {
    const outlook = buildOutlookSummary(input({
      policy_rate: 'green', cpi_inflation: 'green', inflation_expectations: 'yellow',
      long_real_yield: 'green', long_yield_momentum: 'red', israel_risk_proxy: 'yellow',
    }, 75, 'yellow'));
    expect(outlook.overallLabel).toBe('סביבה מעורבת');
    expect(outlook.baseCaseText).toContain('הכוחות התומכים והמכבידים אינם אחידים');
    expect(outlook.conclusionBullets[1]).toBe('איתותי השינוי בתשואה הריאלית ובמגמה הנומינלית אינם אחידים, ולכן התמונה בקצה הארוך מעורבת.');
    expect(outlook.confidenceLabel).toBe('ביטחון נמוך');
  });

  it('builds a cautious scenario from negative inflation, yields, and risk signals', () => {
    const outlook = buildOutlookSummary(input({
      policy_rate: 'red', cpi_inflation: 'red', inflation_expectations: 'red',
      long_real_yield: 'red', long_yield_momentum: 'red', israel_risk_proxy: 'red',
    }, 92, 'red'));
    expect(outlook.overallLabel).toBe('סביבה זהירה');
    expect(outlook.baseCaseText).toContain('הלחץ עשוי להימשך אם');
    expect(outlook.riskTriggerBullets[0]).toContain('שכבר מסומנות כמכבידות');
  });

  it('reduces the confidence label when coverage is low and avoids inventing a current state', () => {
    const outlook = buildOutlookSummary(input({
      policy_rate: 'green', cpi_inflation: 'unknown', inflation_expectations: 'unknown',
      long_real_yield: 'unknown', long_yield_momentum: 'unknown', israel_risk_proxy: 'unknown',
    }, 25, 'unknown'));
    expect(outlook.overallLabel).toBe('אין עדיין תמונה מספקת');
    expect(outlook.currentState).toBe('אין די איתותים מאומתים לקביעת תמונת מצב עדכנית.');
    expect(outlook.confidenceLabel).toBe('ביטחון נמוך');
  });

  it('maps confidence levels from coverage and alignment', () => {
    expect(buildOutlookSummary(input(positive, 82)).confidenceLabel).toBe('ביטחון גבוה יחסית');
    expect(buildOutlookSummary(input({ ...positive, israel_risk_proxy: 'yellow' }, 65, 'yellow')).confidenceLabel).toBe('ביטחון בינוני');
    expect(buildOutlookSummary(input(positive, 49)).confidenceLabel).toBe('ביטחון נמוך');
    expect(buildOutlookSummary(input({ policy_rate: 'green', cpi_inflation: 'yellow', inflation_expectations: 'yellow', long_real_yield: 'yellow', long_yield_momentum: 'yellow', israel_risk_proxy: 'yellow' }, 95, 'yellow')).confidenceLabel).toBe('ביטחון בינוני');
  });

  it('adds an optional credit spread conclusion only when summary data exists', () => {
    const outlook = buildOutlookSummary({ ...input(positive), creditContext: { seriesCount: 4, largest3mWidening: 12 } });
    expect(outlook.conclusionBullets).toHaveLength(4);
    expect(outlook.conclusionBullets[3]).toContain('נרשמה התרחבות');
  });

  it('uses only the approved Hebrew language without recommendation or certainty terms', () => {
    const outlook = buildOutlookSummary(input(positive));
    const generated = [outlook.overallLabel, outlook.currentState, outlook.baseCaseText, ...outlook.conclusionBullets, ...outlook.riskTriggerBullets].join(' ');
    expect(generated).toMatch(/[א-ת]/);
    expect(generated).not.toMatch(/לקנות|למכור|בוודאות|בהכרח|בטוח/);
  });
});
