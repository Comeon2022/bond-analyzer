import type { OverviewResponse } from '../../shared/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '') ?? '';

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number | null = null) {
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
    throw new ApiError('לא ניתן להתחבר לשרת הנתונים. בדקו את כתובת ה־API ואת זמינות ה־Worker.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`שרת הנתונים החזיר תשובה לא תקינה (${response.status}).`, response.status);
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `בקשת הנתונים נכשלה (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return responsePayload<T>(path);
}

export const getOverview = () => apiGet<OverviewResponse>('/api/overview');
export const getApiHealth = () => apiGet<ApiHealth>('/api/health');
