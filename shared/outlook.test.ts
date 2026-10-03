import { describe, expect, it } from 'vitest';
import { buildOutlookSummary, CREDIT_OUTLOOK_THRESHOLDS, type CreditOutlookContext, type OutlookInput } from './outlook';

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

function freshCredit(widening: number | null, narrowing: number | null): CreditOutlookContext {
  return { available: true, stale: false, latestPeriod: '2026-09', seriesCount: 3, largest3mWideningBp: widening, largest3mNarrowingBp: narrowing };
}

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

  it('integrates supportive, mixed, and deteriorating fresh credit conditions', () => {
    const supportive = buildOutlookSummary({ ...input(positive), creditContext: freshCredit(-4, -28) });
    const mixed = buildOutlookSummary({ ...input(positive), creditContext: freshCredit(CREDIT_OUTLOOK_THRESHOLDS.mildWideningBp, -28) });
    const deteriorating = buildOutlookSummary({ ...input(positive), creditContext: freshCredit(CREDIT_OUTLOOK_THRESHOLDS.materialWideningBp, -30) });
    expect(supportive.creditStatus).toBe('תומך');
    expect(supportive.conclusionBullets.filter((bullet) => bullet.includes('שוק האשראי')).length).toBe(1);
    expect(mixed.creditStatus).toBe('מעורב');
    expect(mixed.conclusionBullets.filter((bullet) => bullet.includes('שוק האשראי')).length).toBe(1);
    expect(deteriorating.creditStatus).toBe('זהיר');
    expect(deteriorating.conclusionBullets.filter((bullet) => bullet.includes('מרווחי האשראי')).length).toBe(1);
    expect(deteriorating.riskTriggerBullets.filter((bullet) => bullet.includes('מרווחי האשראי')).length).toBe(1);
    expect(deteriorating.confidenceLabel).toBe('ביטחון בינוני');
  });

  it('does not use stale credit as evidence or change confidence', () => {
    const stale = buildOutlookSummary({ ...input(positive), creditContext: { ...freshCredit(40, null), stale: true } });
    const unavailable = buildOutlookSummary({ ...input(positive), creditContext: null });
    const macroOnly = buildOutlookSummary(input(positive));
    expect(stale.creditStatus).toBe('לא זמין');
    expect(stale.creditDetail).toContain('אינם עדכניים מספיק');
    expect(stale.conclusionBullets).toHaveLength(3);
    expect(stale.riskTriggerBullets).toHaveLength(3);
    expect(stale.confidenceLabel).toBe('ביטחון גבוה יחסית');
    expect(unavailable.creditStatus).toBe('לא זמין');
    expect(unavailable.conclusionBullets).toHaveLength(3);
    expect(unavailable.confidenceLabel).toBe(macroOnly.confidenceLabel);
    expect(unavailable.overallLabel).toBe(macroOnly.overallLabel);
    expect(unavailable.currentState).toBe(macroOnly.currentState);
    expect(unavailable.baseCaseText).toBe(macroOnly.baseCaseText);
    expect(unavailable.riskTriggerBullets).toEqual(macroOnly.riskTriggerBullets);
  });

  it('lowers confidence one step for fresh material widening only when macro is supportive', () => {
    const high = buildOutlookSummary({ ...input(positive), creditContext: freshCredit(30, null) });
    const macroOnly = buildOutlookSummary(input(positive));
    const mediumMacro = buildOutlookSummary({ ...input({ ...positive, israel_risk_proxy: 'yellow' }, 65, 'green'), creditContext: freshCredit(30, null) });
    expect(high.confidenceLabel).toBe('ביטחון בינוני');
    expect(high.confidenceLabel).not.toBe(macroOnly.confidenceLabel);
    expect(mediumMacro.confidenceLabel).toBe('ביטחון נמוך');
    const macroMixed = buildOutlookSummary({ ...input(positive, 82, 'yellow'), creditContext: freshCredit(30, null) });
    expect(macroMixed.confidenceLabel).toBe(buildOutlookSummary(input(positive, 82, 'yellow')).confidenceLabel);
  });

  it('limits credit interpretation to one conclusion and one risk trigger', () => {
    const outlook = buildOutlookSummary({ ...input(positive), creditContext: freshCredit(32, -26) });
    expect(outlook.conclusionBullets.filter((bullet) => /אשראי|מרווחי האשראי/.test(bullet))).toHaveLength(1);
    expect(outlook.riskTriggerBullets.filter((bullet) => /אשראי|מרווחי האשראי/.test(bullet))).toHaveLength(1);
  });

  it('leaves credit unavailable when no fresh common observations exist', () => {
    const noSeries = buildOutlookSummary({ ...input(positive), creditContext: { available: false, stale: false, latestPeriod: null, seriesCount: 0, largest3mWideningBp: null, largest3mNarrowingBp: null } });
    expect(noSeries.creditStatus).toBe('לא זמין');
    expect(noSeries.conclusionBullets).toHaveLength(3);
  });

  it('uses only the approved Hebrew language without recommendation or certainty terms', () => {
    const outlook = buildOutlookSummary(input(positive));
    const generated = [outlook.overallLabel, outlook.currentState, outlook.baseCaseText, ...outlook.conclusionBullets, ...outlook.riskTriggerBullets].join(' ');
    expect(generated).toMatch(/[א-ת]/);
    expect(generated).not.toMatch(/לקנות|למכור|בוודאות|בהכרח|בטוח/);
  });
});
