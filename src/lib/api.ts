import type { OverviewResponse } from '../../shared/types';
import type { CreditSpreadsResponse, CreditSummaryResponse } from './api-types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '') ?? '';

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly kind: 'network' | 'http' | 'invalid-response' | 'schema' = 'http',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiHealth {
  ok: boolean;
  service: string;
  timestamp: string;
  database: 'reachable' | 'unavailable';
}

async function responsePayload<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { headers: { accept: 'application/json' } });
  } catch {
    const endpoint = API_BASE_URL || 'כתובת האתר הנוכחית';
    throw new ApiError(`לא ניתן ליצור קשר עם שרת הנתונים (${endpoint}). בדקו את VITE_API_BASE_URL ואת זמינות ה־Worker.`, null, 'network');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`תשובת שרת הנתונים אינה JSON תקין (HTTP ${response.status}).`, response.status, 'invalid-response');
  }
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `בקשת הנתונים נכשלה (${response.status}).`;
    throw new ApiError(`HTTP ${response.status}: ${detail}`, response.status, 'http');
  }
  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function apiGet<T>(path: string): Promise<T> {
  return responsePayload<T>(path);
}

export async function getOverview(): Promise<OverviewResponse> {
  const payload = await apiGet<unknown>('/api/overview');
  if (!isRecord(payload) || typeof payload.generatedAt !== 'string' || !isRecord(payload.regime)
    || !Array.isArray(payload.cards) || !Array.isArray(payload.signals) || !isRecord(payload.inflation)
    || !isRecord(payload.curves) || !Array.isArray(payload.curves.real) || !Array.isArray(payload.curves.nominal)
    || !Array.isArray(payload.sources) || !isRecord(payload.expectations) || !isRecord(payload.markets)
    || !isRecord(payload.changes) || !isRecord(payload.bondScreener) || !Array.isArray(payload.regimeHistory)) {
    throw new ApiError('שרת הנתונים החזיר מבנה סקירה לא תקין.', null, 'schema');
  }
  return payload as unknown as OverviewResponse;
}

export async function getApiHealth(): Promise<ApiHealth> {
  const payload = await apiGet<unknown>('/api/health');
  if (!isRecord(payload) || payload.ok !== true || payload.service !== 'bond-analyzer-api'
    || typeof payload.timestamp !== 'string' || payload.database !== 'reachable') {
    throw new ApiError('בדיקת תקינות שרת הנתונים נכשלה.', null, 'schema');
  }
  return payload as unknown as ApiHealth;
}

export async function getCreditSpreads(): Promise<CreditSpreadsResponse> {
  const payload = await apiGet<unknown>('/api/credit/spreads');
  if (!isRecord(payload) || !Array.isArray(payload.series) || !isRecord(payload.sourceStatus)
    || typeof payload.source !== 'string' || typeof payload.dataflow !== 'string') {
    throw new ApiError('תגובת נתוני מרווחי האשראי מבנק ישראל אינה תקינה.', null, 'schema');
  }
  return payload as unknown as CreditSpreadsResponse;
}

export async function getCreditSummary(): Promise<CreditSummaryResponse> {
  const payload = await apiGet<unknown>('/api/credit/summary');
  const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const isNullableNumber = (value: unknown): value is number | null => value === null || isNumber(value);
  const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
  const isPeriodSummary = (value: unknown): boolean => value === null || (isRecord(value)
    && typeof value.seriesCode === 'string' && typeof value.label === 'string'
    && isNumber(value.value) && typeof value.timePeriod === 'string');
  const isChangeSummary = (value: unknown): boolean => value === null || (isRecord(value)
    && typeof value.seriesCode === 'string' && typeof value.label === 'string' && isNullableNumber(value.changeBp));
  const source = isRecord(payload) && isRecord(payload.sourceStatus) ? payload.sourceStatus : null;
  const coverage = isRecord(payload) && isRecord(payload.coverage) ? payload.coverage : null;
  const changes = isRecord(payload) && isRecord(payload.changes) ? payload.changes : null;
  const valid = isRecord(payload)
    && isNumber(payload.seriesCount) && Number.isInteger(payload.seriesCount) && payload.seriesCount >= 0
    && isNullableString(payload.latestCommonObservationPeriod)
    && isPeriodSummary(payload.widestCurrentSpread) && isPeriodSummary(payload.narrowestCurrentSpread)
    && isChangeSummary(payload.largest3mWidening) && isChangeSummary(payload.largest3mNarrowing)
    && !!coverage && isNumber(coverage.seriesWithData) && isNumber(coverage.seriesWithoutData)
    && isNumber(coverage.metadataResolvedSeries) && isNumber(coverage.metadataUnresolvedSeries)
    && !!source && typeof source.name === 'string' && typeof source.sourceUrl === 'string' && typeof source.sourcePage === 'string'
    && isNullableString(source.lastSuccessAt) && isNullableString(source.lastErrorAt) && isNullableString(source.lastError)
    && isNullableString(source.latestObservationPeriod) && isNumber(source.observationCount) && isNumber(source.seriesCount)
    && typeof source.stale === 'boolean' && ['pending', 'stale', 'error', 'healthy'].includes(String(source.status))
    && !!changes && Array.isArray(changes.bullets) && changes.bullets.every((bullet: unknown) => typeof bullet === 'string');
  if (!valid) {
    throw new ApiError('תגובת סיכום מרווחי האשראי אינה תקינה.', null, 'schema');
  }
  return payload as unknown as CreditSummaryResponse;
}
