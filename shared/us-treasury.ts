import { lookbackChange } from './phase1b';

export const US_TREASURY_CHANGE_SESSIONS = [1, 5, 20, 60] as const;
export const US_TREASURY_CURVE_FLAT_MAX_BP = 25;

export interface DailyYieldPoint { date: string; value: number; }

export function usTreasuryChangesBps(rows: DailyYieldPoint[], inputToBasisPoints = 100): Record<string, number | null> {
  return Object.fromEntries(US_TREASURY_CHANGE_SESSIONS.map((sessions) => {
    const change = lookbackChange(rows, sessions);
    return [`${sessions}dBp`, change === null ? null : Math.round(change * inputToBasisPoints * 100) / 100];
  }));
}

export function deriveUs2s10s(nominal10y: DailyYieldPoint[], nominal2y: DailyYieldPoint[]): DailyYieldPoint[] {
  const twoYearByDate = new Map(nominal2y.map((point) => [point.date, point.value]));
  return nominal10y.flatMap((point) => {
    const twoYear = twoYearByDate.get(point.date);
    return twoYear === undefined ? [] : [{ date: point.date, value: Math.round((point.value - twoYear) * 100 * 100) / 100 }];
  });
}

export function classifyUs2s10s(spreadBps: number | null): 'normal' | 'flat' | 'inverted' | 'insufficient' {
  if (spreadBps === null || !Number.isFinite(spreadBps)) return 'insufficient';
  if (spreadBps < 0) return 'inverted';
  return spreadBps < US_TREASURY_CURVE_FLAT_MAX_BP ? 'flat' : 'normal';
}
