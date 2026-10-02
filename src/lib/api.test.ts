import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiUrl, getCreditSpreads, getCreditSummary, getOverview } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('frontend API client', () => {
  it('builds relative API URLs without a configured base and normalizes path slashes', () => {
    const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';
    expect(apiUrl('api/health')).toBe(`${base}/api/health`);
    expect(apiUrl('/api/health')).toBe(`${base}/api/health`);
  });

  it('turns HTTP and network failures into readable API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })));
    await expect(apiGet('/api/missing')).rejects.toMatchObject({ status: 404, kind: 'http', message: 'HTTP 404: Not found' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(apiGet('/api/health')).rejects.toMatchObject({ status: null, kind: 'network' });
  });

  it('returns typed JSON payloads on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })));
    await expect(apiGet<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true });
  });

  it('validates credit-spread and summary response shapes', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ series: [], sourceStatus: { status: 'pending' }, source: 'https://boi.org.il', dataflow: 'BOI.STATISTICS:SECDWH:1.0' }))
      .mockResolvedValueOnce(Response.json({ seriesCount: 0, coverage: {}, sourceStatus: {}, changes: { bullets: [] } })));
    await expect(getCreditSpreads()).resolves.toMatchObject({ series: [], dataflow: 'BOI.STATISTICS:SECDWH:1.0' });
    await expect(getCreditSummary()).resolves.toMatchObject({ seriesCount: 0, changes: { bullets: [] } });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ series: null })));
    await expect(getCreditSpreads()).rejects.toMatchObject({ kind: 'schema' });
  });

  it('rejects an overview response with a missing/null schema instead of rendering it as data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ generatedAt: null, cards: null })));
    await expect(getOverview()).rejects.toMatchObject({ message: 'שרת הנתונים החזיר מבנה סקירה לא תקין.' });
  });
});
