import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { __test, type Env } from './index';

const SECRET = 'test-admin-secret-do-not-leak';

function env(token: string | null = SECRET): Env {
  const db = {
    prepare: () => ({
      bind() { return this; },
      all: async () => ({ results: [] }),
    }),
  };
  return { DB: db as unknown as D1Database, ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher, ADMIN_INGEST_TOKEN: token ?? undefined };
}

function request(method = 'POST', authorization?: string): Request {
  return new Request('https://api.example/api/admin/ingest', { method, headers: authorization ? { Authorization: authorization } : undefined });
}

afterEach(() => vi.restoreAllMocks());

describe('secure manual ingestion endpoint', () => {
  it('allows POST, calls the shared pipeline, and returns runtime source results', async () => {
    const run = vi.fn(async () => undefined);
    const response = await __test.handleManualIngestion(request('POST', `Bearer ${SECRET}`), env(), run);
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
    expect(body).toMatchObject({ ok: true, sources: {} });
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it('rejects methods other than POST and advertises Allow: POST', async () => {
    const response = await worker.fetch(request('GET', `Bearer ${SECRET}`), env());
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('returns 401 for missing and malformed bearer credentials', async () => {
    expect((await worker.fetch(request(), env())).status).toBe(401);
    expect((await worker.fetch(request('POST', 'Basic abc'), env())).status).toBe(401);
    expect((await worker.fetch(request('POST', `Bearer ${SECRET} extra`), env())).status).toBe(401);
  });

  it('returns 403 for an incorrect token and ignores query-string tokens', async () => {
    expect((await worker.fetch(request('POST', 'Bearer incorrect'), env())).status).toBe(403);
    const query = new Request(`https://api.example/api/admin/ingest?token=${SECRET}`, { method: 'POST' });
    const response = await worker.fetch(query, env());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(SECRET);
  });

  it('reports an unconfigured Worker secret without starting ingestion', async () => {
    const run = vi.fn(async () => undefined);
    const response = await __test.handleManualIngestion(request('POST', `Bearer ${SECRET}`), env(null), run);
    expect(response.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(SECRET);
  });

  it('sanitizes failures and never includes the token in response or logs', async () => {
    const error = new Error(`private upstream detail ${SECRET}`);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await __test.handleManualIngestion(request('POST', `Bearer ${SECRET}`), env(), async () => { throw error; });
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).toContain('pipeline_failed');
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain('private upstream detail');
    expect(log.mock.calls.flat().join(' ')).not.toContain(SECRET);
  });

  it('returns 409 while a manual pipeline is already running', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const first = __test.handleManualIngestion(request('POST', `Bearer ${SECRET}`), env(), async () => pending);
    await Promise.resolve();
    const second = await __test.handleManualIngestion(request('POST', `Bearer ${SECRET}`), env(), async () => undefined);
    expect(second.status).toBe(409);
    expect(await second.text()).toContain('ingestion_already_running');
    finish();
    expect((await first).status).toBe(200);
  });

  it('keeps the manual operator route outside public browser CORS', async () => {
    const response = await worker.fetch(new Request('https://api.example/api/admin/ingest', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }), env());
    expect(response.status).toBe(405);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('keeps the scheduled handler wired to the production ingestion pipeline', async () => {
    const scheduledEnv = env();
    scheduledEnv.DB = { prepare: () => { throw new Error('scheduled pipeline probe'); } } as unknown as D1Database;
    const tasks: Promise<unknown>[] = [];
    await worker.scheduled({} as ScheduledController, scheduledEnv, { waitUntil: (task: Promise<unknown>) => tasks.push(task) } as unknown as ExecutionContext);
    expect(tasks).toHaveLength(1);
    await expect(tasks[0]).rejects.toThrow('scheduled pipeline probe');
  });
});
