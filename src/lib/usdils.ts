import type { MarketSeries, Observation } from '../../shared/types';

export const USDILS_MATERIAL_CHANGE_PCT = 0.3;
export const USDILS_HERO_CHANGE_PCT = 1;
export const USDILS_MAX_AGE_DAYS = 7;
export const USDILS_RANGE_LOW_POSITION_MAX = 1 / 3;
export const USDILS_RANGE_HIGH_POSITION_MIN = 2 / 3;
export const USDILS_RANGE_SESSIONS = { short: 20, long: 60 } as const;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const USDILS_CHART_RANGES = [
  { id: '1M', label: 'חודש', sessions: 20 },
  { id: '3M', label: '3 חודשים', sessions: 60 },
  { id: '6M', label: '6 חודשים', sessions: 120 },
  { id: '1Y', label: 'שנה', sessions: 240 },
] as const;

export type UsdIlsTrend = 'strengthening' | 'weakening' | 'mixed' | 'unclear' | 'insufficient';

export function usdIlsIsFresh(series: Pick<MarketSeries, 'status' | 'observationDate'>, now = new Date()): boolean {
  if (series.status !== 'ok' || !series.observationDate) return false;
  const date = new Date(`${series.observationDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf())) return false;
  const ageDays = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - date.valueOf()) / MILLISECONDS_PER_DAY;
  return ageDays >= 0 && ageDays <= USDILS_MAX_AGE_DAYS;
}

export function classifyUsdIlsTrend(changes: Pick<MarketSeries, 'changes'>): UsdIlsTrend {
  const material = ['5dPct', '20dPct', '60dPct']
    .map((key) => changes.changes[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map((value) => Math.abs(value) < USDILS_MATERIAL_CHANGE_PCT ? 0 : Math.sign(value));
  if (material.length < 2) return 'insufficient';
  const signs = new Set(material.filter((sign) => sign !== 0));
  if (signs.size > 1) return 'mixed';
  if (signs.size === 0) return 'unclear';
  return signs.has(-1) ? 'strengthening' : 'weakening';
}

export function usdIlsTrendLabel(trend: UsdIlsTrend): string {
  return ({ strengthening: 'שקל מתחזק', weakening: 'שקל נחלש', mixed: 'מגמה מעורבת', unclear: 'ללא מגמה ברורה', insufficient: 'אין מספיק נתונים' })[trend];
}

export function usdIlsDirection(changePct: number | null): 'strengthened' | 'weakened' | 'unchanged' | 'unavailable' {
  if (changePct === null || !Number.isFinite(changePct)) return 'unavailable';
  if (Math.abs(changePct) < USDILS_MATERIAL_CHANGE_PCT) return 'unchanged';
  return changePct < 0 ? 'strengthened' : 'weakened';
}

export function usdIlsInterpretation(trend: UsdIlsTrend, fresh: boolean): string | null {
  if (!fresh) return null;
  if (trend === 'strengthening') return 'השקל התחזק בתקופה האחרונה. אם המגמה תימשך, היא עשויה להפחית מעט לחץ אינפלציוני דרך מחירי היבוא.';
  if (trend === 'weakening') return 'השקל נחלש בתקופה האחרונה. אם המגמה תימשך, היא עלולה להוסיף לחץ למחירי היבוא ולתנאי הסיכון המקומיים.';
  if (trend === 'mixed') return 'התנועה בדולר/שקל אינה חד־כיוונית כרגע, ולכן קשה להסיק ממנה לבדה על כיוון האינפלציה או האג״ח.';
  return 'השינויים בשער אינם מצביעים כרגע על כיוון ברור; שער החליפין לבדו אינו קובע את האינפלציה או את כיוון האג״ח.';
}

export function usdIlsRange(history: Observation[], sessions: number): { low: number; high: number } | null {
  if (history.length < sessions) return null;
  const values = history.slice(-sessions).map((point) => point.value).filter(Number.isFinite);
  if (values.length < sessions) return null;
  return { low: Math.min(...values), high: Math.max(...values) };
}

export function usdIlsChartHistory(history: Observation[], sessions: number): Observation[] | null {
  if (history.length <= sessions) return null;
  return history.slice(-(sessions + 1));
}

export function usdIlsHeroMove(series: MarketSeries, now = new Date()): { direction: 'strengthening' | 'weakening'; changePct: number } | null {
  if (!usdIlsIsFresh(series, now)) return null;
  const changePct = series.changes['20dPct'];
  if (typeof changePct !== 'number' || Math.abs(changePct) < USDILS_HERO_CHANGE_PCT) return null;
  return { direction: changePct < 0 ? 'strengthening' : 'weakening', changePct };
}
