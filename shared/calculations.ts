import type { SignalStatus } from './types';

export interface DatedValue { date: string; value: number }

export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current / previous) - 1) * 100 * 1e10) / 1e10;
}

export function basisPointChange(currentPercent: number, previousPercent: number): number {
  return (currentPercent - previousPercent) * 100;
}

export function movingAverage(values: number[], period: number): number | null {
  if (period < 1 || values.length < period) return null;
  const recent = values.slice(-period);
  return recent.reduce((sum, value) => sum + value, 0) / period;
}

export function interpolateCurve(points: Array<{ tenorYears: number; yieldPercent: number }>, targetYears: number): number | null {
  const sorted = [...points].filter((point) => Number.isFinite(point.tenorYears) && Number.isFinite(point.yieldPercent)).sort((a, b) => a.tenorYears - b.tenorYears);
  if (!sorted.length || targetYears < sorted[0].tenorYears || targetYears > sorted[sorted.length - 1].tenorYears) return null;
  const exact = sorted.find((point) => point.tenorYears === targetYears);
  if (exact) return exact.yieldPercent;
  const upperIndex = sorted.findIndex((point) => point.tenorYears > targetYears);
  const lower = sorted[upperIndex - 1];
  const upper = sorted[upperIndex];
  const fraction = (targetYears - lower.tenorYears) / (upper.tenorYears - lower.tenorYears);
  return lower.yieldPercent + fraction * (upper.yieldPercent - lower.yieldPercent);
}

export function weightedRegime(statuses: Array<{ status: SignalStatus; weight: number }>, positiveThreshold = 0.35, negativeThreshold = -0.35): { status: SignalStatus; score: number | null; coveragePct: number; counts: Record<SignalStatus, number>; confidence: string } {
  const counts: Record<SignalStatus, number> = { green: 0, yellow: 0, red: 0, unknown: 0 };
  let weighted = 0;
  let availableWeight = 0;
  const totalWeight = statuses.reduce((sum, signal) => sum + signal.weight, 0);
  for (const signal of statuses) {
    counts[signal.status] += 1;
    if (signal.status === 'unknown') continue;
    weighted += (signal.status === 'green' ? 1 : signal.status === 'red' ? -1 : 0) * signal.weight;
    availableWeight += signal.weight;
  }
  const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;
  if (availableWeight === 0) return { status: 'unknown', score: null, coveragePct: 0, counts, confidence: 'אין מספיק נתונים' };
  const score = weighted / availableWeight;
  const status: SignalStatus = score >= positiveThreshold ? 'green' : score <= negativeThreshold ? 'red' : 'yellow';
  const directional = statuses.filter((item) => item.status === 'green' || item.status === 'red').length;
  const agreement = directional < 2 || counts.green === 0 || counts.red === 0 ? 1 : Math.max(counts.green, counts.red) / directional;
  const confidence = coverage >= 0.8 && agreement >= 0.7 ? 'גבוהה' : coverage >= 0.5 ? 'בינונית' : 'נמוכה';
  return { status, score, coveragePct: Math.round(coverage * 10000) / 100, counts, confidence };
}

export function inflationSignal(yoy: number | null, previousYoy: number | null, targetLow = 1, targetHigh = 3, materialRise = 0.3): SignalStatus {
  if (yoy === null) return 'unknown';
  const insideTarget = yoy >= targetLow && yoy <= targetHigh;
  if (yoy > targetHigh || (previousYoy !== null && yoy - previousYoy > materialRise)) return 'red';
  if (insideTarget && previousYoy !== null && yoy <= previousYoy) return 'green';
  return insideTarget ? 'yellow' : 'red';
}

export function directionSignal(changeBps: number | null, thresholdBps: number): SignalStatus {
  if (changeBps === null) return 'unknown';
  if (changeBps < -thresholdBps) return 'green';
  if (changeBps > thresholdBps) return 'red';
  return 'yellow';
}

