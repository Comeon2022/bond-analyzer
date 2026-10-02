import type { OverviewResponse } from '../../shared/types';

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
