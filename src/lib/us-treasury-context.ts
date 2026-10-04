import type { MarketSeries } from '../../shared/types';
import { classifyUs2s10s } from '../../shared/us-treasury';

export const US_TREASURY_TREND_THRESHOLD_BPS = 5;
export const US_TREASURY_BREAKEVEN_THRESHOLD_BPS = 3;
export const US_TREASURY_HERO_THRESHOLD_BPS = 25;
export const US_TREASURY_MAX_AGE_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type TreasuryTrend = 'rising' | 'falling' | 'mixed' | 'insufficient';
export type BreakevenTrend = 'rising' | 'falling' | 'mixed' | 'stable' | 'insufficient';
export type TreasuryCurveShape = 'normal' | 'flat' | 'inverted' | 'insufficient';
export type TreasuryOverallLabel = 'תומך באג״ח' | 'מעורב' | 'לוחץ על אג״ח' | 'אין מספיק נתונים';

export interface UsTreasuryContext {
  nominal10yTrend: TreasuryTrend;
  real10yTrend: TreasuryTrend;
  inflationTrend: BreakevenTrend;
  curveShape: TreasuryCurveShape;
  overallLabel: TreasuryOverallLabel;
  explanation: string;
}

export function usTreasuryIsFresh(series: Pick<MarketSeries, 'status' | 'observationDate'>, now = new Date()): boolean {
  if (series.status !== 'ok' || !series.observationDate) return false;
  const observed = new Date(`${series.observationDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(observed.valueOf())) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ageDays = (today - observed.valueOf()) / MILLISECONDS_PER_DAY;
  return ageDays >= 0 && ageDays <= US_TREASURY_MAX_AGE_DAYS;
}

function materialSigns(series: MarketSeries, threshold: number): number[] | null {
  const changes = ['5dBp', '20dBp', '60dBp'].map((key) => series.changes[key]);
  const available = changes.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (available.length < 2) return null;
  return available.map((value) => Math.abs(value) < threshold ? 0 : Math.sign(value));
}

function yieldTrend(series: MarketSeries): TreasuryTrend {
  if (!usTreasuryIsFresh(series)) return 'insufficient';
  const signs = materialSigns(series, US_TREASURY_TREND_THRESHOLD_BPS);
  if (!signs) return 'insufficient';
  const material = new Set(signs.filter((sign) => sign !== 0));
  if (material.size > 1 || material.size === 0) return 'mixed';
  return material.has(-1) ? 'falling' : 'rising';
}

function breakevenTrend(series: MarketSeries): BreakevenTrend {
  if (!usTreasuryIsFresh(series)) return 'insufficient';
  const signs = materialSigns(series, US_TREASURY_BREAKEVEN_THRESHOLD_BPS);
  if (!signs) return 'insufficient';
  const material = new Set(signs.filter((sign) => sign !== 0));
  if (material.size > 1) return 'mixed';
  if (material.size === 0) return 'stable';
  return material.has(-1) ? 'falling' : 'rising';
}

export function buildUsTreasuryContext(input: {
  nominal10y: MarketSeries;
  real10y: MarketSeries;
  breakeven10y: MarketSeries;
  curve2s10s: MarketSeries;
}, now = new Date()): UsTreasuryContext {
  const nominal10yTrend = yieldTrend(input.nominal10y);
  const real10yTrend = yieldTrend(input.real10y);
  const inflationTrend = breakevenTrend(input.breakeven10y);
  const curveFresh = usTreasuryIsFresh(input.curve2s10s, now);
  const curveShape = curveFresh ? classifyUs2s10s(input.curve2s10s.value) : 'insufficient';
  const yieldsFresh = usTreasuryIsFresh(input.nominal10y, now) && usTreasuryIsFresh(input.real10y, now);
  if (!yieldsFresh) return { nominal10yTrend, real10yTrend, inflationTrend, curveShape, overallLabel: 'אין מספיק נתונים', explanation: 'נתוני התשואות בארה״ב אינם עדכניים מספיק כדי להסיק על המצב הנוכחי.' };
  if (nominal10yTrend === 'insufficient' || real10yTrend === 'insufficient') {
    return { nominal10yTrend, real10yTrend, inflationTrend, curveShape, overallLabel: 'אין מספיק נתונים', explanation: 'אין מספיק תצפיות עדכניות להשוואת המגמה בתשואות בארה״ב.' };
  }

  if (nominal10yTrend === 'falling' && real10yTrend === 'falling') {
    return { nominal10yTrend, real10yTrend, inflationTrend, curveShape, overallLabel: 'תומך באג״ח', explanation: 'התשואות הנומינלית והריאלית בארה״ב יורדות; אם המגמה תימשך, היא עשויה להפחית לחץ על אג״ח ארוכות בעולם וגם בישראל.' };
  }
  if (nominal10yTrend === 'rising' && real10yTrend === 'rising') {
    const inflationContext = inflationTrend === 'rising' ? ' במקביל, גם ציפיות האינפלציה עולות.' : '';
    return { nominal10yTrend, real10yTrend, inflationTrend, curveShape, overallLabel: 'לוחץ על אג״ח', explanation: `התשואות בארה״ב עולות, וגם התשואה אחרי התאמה לציפיות אינפלציה עולה; הדבר עלול להקשות על ירידת תשואות גם בישראל.${inflationContext}` };
  }
  if (nominal10yTrend === 'rising' && inflationTrend === 'rising') {
    return { nominal10yTrend, real10yTrend, inflationTrend, curveShape, overallLabel: 'מעורב', explanation: 'התשואה הנומינלית והפיצוי לאינפלציה עולים יחד; ייתכן שחלק מהשינוי קשור לציפיות למחירים.' };
  }
  return { nominal10yTrend, real10yTrend, inflationTrend, curveShape, overallLabel: 'מעורב', explanation: 'התשואות בארה״ב אינן נעות כולן באותו כיוון, ולכן כרגע התמונה מעורבת. ההשפעה על אג״ח בישראל אינה אוטומטית.' };
}

export function usTreasuryTrendLabel(trend: TreasuryTrend): string {
  return ({ rising: 'תשואות עולות', falling: 'תשואות יורדות', mixed: 'ללא מגמה ברורה', insufficient: 'אין מספיק נתונים' })[trend];
}

export function usTreasuryCurveLabel(shape: TreasuryCurveShape): string {
  return ({ normal: 'עקום עולה', flat: 'עקום שטוח', inverted: 'עקום הפוך', insufficient: 'אין מספיק נתונים' })[shape];
}

export function usTreasuryHeroMove(series: MarketSeries, now = new Date()): { direction: 'rising' | 'falling'; changeBps: number } | null {
  if (!usTreasuryIsFresh(series, now)) return null;
  const changeBps = series.changes['20dBp'];
  if (typeof changeBps !== 'number' || Math.abs(changeBps) < US_TREASURY_HERO_THRESHOLD_BPS) return null;
  return { direction: changeBps > 0 ? 'rising' : 'falling', changeBps };
}
