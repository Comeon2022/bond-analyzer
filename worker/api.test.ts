import { describe, expect, it } from 'vitest';
import worker, { type Env } from './index';

function testEnv(databaseAvailable = true): Env {
  const db = {
    prepare: () => ({ first: async () => {
      if (!databaseAvailable) throw new Error('private database diagnostic');
      return { ok: 1 };
    } }),
  };
  return { DB: db as unknown as D1Database, ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher, ALLOWED_ORIGINS: 'http://localhost:5173,https://bond-analyzer-av2.pages.dev' };
}

describe('Worker API health and CORS', () => {
  it('reports only safe operational health details when D1 is reachable', async () => {
    const response = await worker.fetch(new Request('https://api.example/api/health', { headers: { Origin: 'http://localhost:5173' } }), testEnv());
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, service: 'bond-analyzer-api', database: 'reachable' });
    expect(body.timestamp).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain('account');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('reports database unavailability without leaking the D1 error', async () => {
    const response = await worker.fetch(new Request('https://api.example/api/health'), testEnv(false));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ ok: false, service: 'bond-analyzer-api', database: 'unavailable' });
    expect(body).not.toContain('private database diagnostic');
  });

  it('answers preflight for configured origins and rejects unlisted origins', async () => {
    const allowed = await worker.fetch(new Request('https://api.example/api/overview', { method: 'OPTIONS', headers: { Origin: 'https://bond-analyzer-av2.pages.dev' } }), testEnv());
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(allowed.headers.get('Vary')).toContain('Origin');

    const rejected = await worker.fetch(new Request('https://api.example/api/health', { headers: { Origin: 'https://evil.example' } }), testEnv());
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
