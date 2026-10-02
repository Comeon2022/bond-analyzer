import type { RiskComponent, RiskProxy, SignalStatus } from './types';

export interface RiskInputs {
  usdIls20dPercent: number | null;
  israelRealYieldChangeBps: number | null;
  realYieldDifferentialChangeBps: number | null;
  usdIlsObservationDate: string | null;
  israelRealObservationDate: string | null;
  differentialObservationDate: string | null;
}

export interface RiskThresholds {
  usdIlsPercent: number;
  realYieldBps: number;
  differentialBps: number;
}

function classify(value: number | null, threshold: number, supportiveWhenFalling: boolean): { score: number | null; status: SignalStatus } {
  if (value === null || !Number.isFinite(value)) return { score: null, status: 'unknown' };
  if (value <= -threshold) return { score: supportiveWhenFalling ? 1 : -1, status: supportiveWhenFalling ? 'green' : 'red' };
  if (value >= threshold) return { score: supportiveWhenFalling ? -1 : 1, status: supportiveWhenFalling ? 'red' : 'green' };
  return { score: 0, status: 'yellow' };
}

export function riskConditionsProxy(inputs: RiskInputs, thresholds: RiskThresholds): RiskProxy {
  const inputsByKey = [
    { key: 'usdIls20d', value: inputs.usdIls20dPercent, unit: '% / 20 sessions', threshold: thresholds.usdIlsPercent, supportiveWhenFalling: true, date: inputs.usdIlsObservationDate },
    { key: 'israelRealYieldChange', value: inputs.israelRealYieldChangeBps, unit: 'bp / source period', threshold: thresholds.realYieldBps, supportiveWhenFalling: true, date: inputs.israelRealObservationDate },
    { key: 'realYieldDifferentialChange', value: inputs.realYieldDifferentialChangeBps, unit: 'bp / comparable period', threshold: thresholds.differentialBps, supportiveWhenFalling: true, date: inputs.differentialObservationDate },
  ];
  const components: RiskComponent[] = inputsByKey.map((input) => {
    const classified = classify(input.value, input.threshold, input.supportiveWhenFalling);
    return { key: input.key, value: input.value, unit: input.unit, normalizedScore: classified.score, status: classified.status, sourceObservationDate: input.date };
  });
  const available = components.filter((component) => component.normalizedScore !== null);
  if (!available.length) return { value: null, status: 'unknown', label: 'Israel Risk Conditions Proxy', components, coverage: 0, explanationHe: 'אין די רכיבי מקור מאומתים לחישוב תנאי הסיכון.' };
  const score = available.reduce((sum, component) => sum + component.normalizedScore!, 0) / available.length;
  const status: SignalStatus = score >= 0.5 ? 'green' : score <= -0.5 ? 'red' : 'yellow';
  return {
    value: score,
    status,
    label: 'Israel Risk Conditions Proxy',
    components,
    coverage: available.length / components.length,
    explanationHe: 'מדד תנאי סיכון ישראל הוא פרוקסי שקוף המבוסס על שער החליפין ופערי תשואות; הוא אינו ציטוט CDS או מדד סחיר.',
  };
}

export function lookbackChange<T extends { date: string; value: number }>(rows: T[], sessions: number): number | null {
  if (!Number.isInteger(sessions) || sessions < 1 || rows.length <= sessions) return null;
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const current = ordered.at(-1)!;
  const previous = ordered.at(-(sessions + 1))!;
  return current.value - previous.value;
}

export function lookbackPercentChange<T extends { date: string; value: number }>(rows: T[], sessions: number): number | null {
  const delta = lookbackChange(rows, sessions);
  if (delta === null) return null;
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const previous = ordered.at(-(sessions + 1))!.value;
  if (previous === 0) return null;
  return Math.round((delta / previous) * 100 * 1e10) / 1e10;
}

export function buildChangeSummary(input: { israelRealYieldChangeBps: number | null; usdIls20dPercent: number | null; inflationExpectationChange: number | null; usNominal5dBps: number | null; bondSpreadChanges?: Array<{issuerHe:string;seriesName:string;changeBp:number|null;thresholdBp:number}> }): { bullets: string[]; summary: string } {
  const bullets: string[] = [];
  if (input.israelRealYieldChangeBps !== null) bullets.push(`\u05e9\u05d9\u05e0\u05d5\u05d9 \u05d1\u05ea\u05e9\u05d5\u05d0\u05d4 \u05d4\u05e8\u05d9\u05d0\u05dc\u05d9\u05ea \u05d4\u05d9\u05e9\u05e8\u05d0\u05dc\u05d9\u05ea: ${input.israelRealYieldChangeBps.toFixed(1)} \u05e0\u05f4\u05d1.`);
  if (input.usdIls20dPercent !== null) bullets.push(`\u05e9\u05d9\u05e0\u05d5\u05d9 \u05d1-USD/ILS: ${input.usdIls20dPercent.toFixed(2)}% \u05d1-20 \u05d9\u05de\u05d9 \u05de\u05e1\u05d7\u05e8.`);
  if (input.inflationExpectationChange !== null) bullets.push(`\u05e9\u05d9\u05e0\u05d5\u05d9 \u05d1\u05e6\u05d9\u05e4\u05d9\u05d9\u05ea \u05d4\u05d0\u05d9\u05e0\u05e4\u05dc\u05e6\u05d9\u05d4 \u05dc\u05e9\u05e0\u05d4: ${input.inflationExpectationChange.toFixed(2)} \u05e0\u05e7\u05d5\u05d3\u05d5\u05ea \u05d0\u05d7\u05d5\u05d6.`);
  if (input.usNominal5dBps !== null) bullets.push(`\u05e9\u05d9\u05e0\u05d5\u05d9 \u05d1\u05ea\u05e9\u05d5\u05d0\u05ea \u05d0\u05d2\u05f4\u05d7 \u05de\u05de\u05e9\u05dc\u05ea \u05d0\u05e8\u05d4\u05f4\u05d1 \u05dc-10 \u05e9\u05e0\u05d9\u05dd: ${input.usNominal5dBps.toFixed(1)} \u05e0\u05f4\u05d1 \u05d1-5 \u05ea\u05e6\u05e4\u05d9\u05d5\u05ea.`);
  const bondBullets=(input.bondSpreadChanges??[]).filter(x=>x.changeBp!==null&&Math.abs(x.changeBp)>=x.thresholdBp).slice(0,2).map(x=>`\u05de\u05e8\u05d5\u05d5\u05d7 \u05d0\u05d2\u05f4\u05d7 ${x.issuerHe} ${x.seriesName} \u05d4\u05e9\u05ea\u05e0\u05d4 \u05d1-${x.changeBp!.toFixed(1)} \u05e0\u05f4\u05d1 \u05d1\u05ea\u05e7\u05d5\u05e4\u05d4 \u05d4\u05d6\u05de\u05d9\u05e0\u05d4.`);
  bullets.push(...bondBullets);
  return { bullets: bullets.slice(0, 5), summary: bullets.length ? '\u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05de\u05ea\u05d0\u05e8\u05d9\u05dd \u05ea\u05e6\u05e4\u05d9\u05d5\u05ea \u05d1\u05dc\u05d1\u05d3; \u05d0\u05d9\u05df \u05d1\u05d4\u05dd \u05d8\u05e2\u05e0\u05d4 \u05e1\u05d9\u05d1\u05ea\u05d9\u05ea \u05d0\u05d5 \u05d4\u05de\u05dc\u05e6\u05d4 \u05dc\u05e4\u05e2\u05d5\u05dc\u05d4.' : '\u05de\u05de\u05ea\u05d9\u05df \u05dc\u05ea\u05e6\u05e4\u05d9\u05d5\u05ea \u05de\u05d0\u05d5\u05de\u05ea\u05d5\u05ea \u05dc\u05d4\u05e9\u05d5\u05d5\u05d0\u05d4.' };
}
