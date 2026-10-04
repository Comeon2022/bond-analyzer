import { inflationSignal, percentChange, weightedRegime } from '../shared/calculations';
import type { MacroCard, MarketSeries, Observation, OverviewResponse, Signal, SignalStatus, SourceStatus, YieldPoint } from '../shared/types';
import { buildChangeSummary, lookbackChange, lookbackPercentChange, riskConditionsProxy } from '../shared/phase1b';
import { deriveUs10yBreakeven, deriveUs2s10s, usTreasuryChangesBps } from '../shared/us-treasury';
import type { BondMarketRecord, BondFilters, LinkageType } from '../shared/bonds';
import { quoteAgeBusinessDays, applyBondFilters, matchGovernmentBenchmark, creditSpreadBp, spreadPerDuration } from '../shared/bonds';
import { bondSourceStatus } from './bond-source';
import { fetchCbsCpiWithFallback, fetchJson, fetchText, fetchWorkbook, parseBoiCurve, parseBoiExchangeHistory, parseBoiExchangeRate, parseBoiInflationExpectations, parsePolicyRate, parseTreasuryNominalCurve, parseTreasuryRealCurve } from './sources';
import { BOI_SECDWH_CSV_URL, BOI_SECDWH_DSD_URL, BOI_SECDWH_FLOW_URL, BOI_SECDWH_PAGE_URL, creditChanges, creditChangeBullet, fetchBoiXml, isCreditSeriesStale, parseBoiCodelist, parseBoiCreditCsv, parseBoiDsdCodelistRefs, resolveOfficialLabel, type CreditMetadata } from './credit';

export interface Env { DB: D1Database; ASSETS: Fetcher; TASE_DATAHUB_API_KEY?: string; TASE_DATAHUB_BASE_URL?: string; ALLOWED_ORIGINS?: string; ADMIN_INGEST_TOKEN?: string; }
interface DbObservation { observation_date: string; value: number; ingested_at: string; source_timestamp: string | null; revision_number: number; }
interface DbSignalDefinition { key: string; name_he: string; description_he: string; weight: number; }
interface DbSetting { key: string; value_json: string; }
interface DbRegimeHistory { snapshot_date:string; score:number | null; coverage_pct:number; status:SignalStatus; green_count:number; yellow_count:number; red_count:number; }
interface RunRow { job_key: string; started_at: string; completed_at: string | null; status: string; records_read: number; records_written: number; error_message: string | null; details_json: string; }

const BOI_RATE_URL = 'https://www.boi.org.il/PublicApi/GetInterest';
const BOI_USD_RATE_URL = 'https://boi.org.il/PublicApi/GetExchangeRate?key=USD';
const BOI_USD_HISTORY_URL = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS';
const BOI_EXPECTATIONS_URL = 'https://kamakama.gov.il/boi_files/Statistics/shcf10_e.xls';
const BOI_EXPECTATIONS_PAGE = 'https://boi.org.il/en/economic-roles/statistics/inflation-expectations-and-inflation-forecasts/inflation-expectations-and-inflation-forecasts/';
const US_TREASURY_NOMINAL_CSV_URL = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv';
const US_TREASURY_PAGE = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates';
const CBS_CPI_JSON_URL = 'https://api.cbs.gov.il/index/data/price?id=120010&format=json&download=false&lang=he&last=240&PageSize=300&coef=true';
const CBS_CPI_XML_URL = 'https://api.cbs.gov.il/index/data/price?id=120010&format=xml&download=false&lang=he&last=240&PageSize=300&coef=true';
const BOI_NOMINAL_CURVE_URL = 'https://boi.org.il/boi_files/Statistics/shcd08_e.xls';
const BOI_REAL_CURVE_URL = 'https://boi.org.il/boi_files/Statistics/shcd07_e.xls';
const BOI_CURVE_PAGE = 'https://boi.org.il/en/economic-roles/statistics/bonds-and-central-bank-bills-makam/bonds-and-central-bank-bills-makam-yields-to-maturity/';
const BOI_RATE_PAGE = 'https://www.boi.org.il/qawebsite/';
const CBS_CPI_PAGE = 'https://www.cbs.gov.il/en/cbsNewBrand/Pages/Api-Indices.aspx';
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function todayUtc(): string { return new Date().toISOString().slice(0, 10); }
function nowIso(): string { return new Date().toISOString(); }
function uuid(): string { return crypto.randomUUID(); }
function round(value: number, places = 4): number { return Math.round(value * (10 ** places)) / (10 ** places); }
async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildRevisionInsert(table: 'macro_observations' | 'yield_curve_observations' | 'signal_snapshots', columns: Record<string, string | number | null>, identity: Array<string | number>, hash: string): { sql: string; values: Array<string | number | null> } {
  const names = Object.keys(columns);
  const marks = names.map(() => '?').join(', ');
  const existingWhere = table === 'macro_observations'
    ? 'series_id = ? AND observation_date = ?'
    : table === 'yield_curve_observations'
      ? 'curve_type = ? AND tenor_years = ? AND observation_date = ?'
      : 'signal_key = ? AND observation_date = ?';
  const sql = `INSERT INTO ${table} (${names.join(', ')}, revision_number) SELECT ${marks}, COALESCE(MAX(revision_number), 0) + 1 FROM ${table} WHERE ${existingWhere} HAVING COALESCE((SELECT raw_payload_hash FROM ${table} WHERE ${existingWhere} ORDER BY revision_number DESC LIMIT 1), '') <> ?`;
  return { sql, values: [...Object.values(columns), ...identity, ...identity, hash] };
}

async function insertRevision(db: D1Database, table: 'macro_observations' | 'yield_curve_observations', columns: Record<string, string | number | null>, identity: Array<string | number>, hash: string): Promise<number> {
  const { sql, values } = buildRevisionInsert(table, columns, identity, hash);
  const result = await db.prepare(sql).bind(...values).run();
  return result.meta.changes;
}

async function runWithStatus(db: D1Database, jobKey: string, work: (startedAt: string) => Promise<{ read: number; written: number; details?: Record<string, unknown> }>): Promise<void> {
  const startedAt = nowIso();
  const runId = uuid();
  await db.prepare('INSERT INTO ingestion_runs (id, job_key, started_at, status) VALUES (?, ?, ?, ?)').bind(runId, jobKey, startedAt, 'running').run();
  try {
    const result = await work(startedAt);
    const completedAt = nowIso();
    await db.prepare('UPDATE ingestion_runs SET completed_at = ?, status = ?, records_read = ?, records_written = ?, details_json = ? WHERE id = ?')
      .bind(completedAt, 'success', result.read, result.written, JSON.stringify(result.details ?? {}), runId).run();
    const sourceKey = jobKey.startsWith('cbs_') ? 'israel_cbs' : jobKey.startsWith('fred_') ? 'fred' : jobKey.startsWith('us_treasury_') ? 'us_treasury' : jobKey.startsWith('boi_credit_') ? 'boi_credit_spreads' : 'bank_of_israel';
    await db.prepare('UPDATE data_sources SET last_success_at = ?, last_error_at = NULL, last_error_message = NULL, updated_at = ? WHERE key = ?')
      .bind(completedAt, completedAt, sourceKey).run();
  } catch (error) {
    const completedAt = nowIso();
    const message = error instanceof Error ? error.message : 'Unknown source error';
    console.error('Scheduled ingestion job failed', jobKey, message.slice(0, 500));
    await db.prepare('UPDATE ingestion_runs SET completed_at = ?, status = ?, error_message = ? WHERE id = ?').bind(completedAt, 'error', message.slice(0, 500), runId).run();
    const sourceKey = jobKey.startsWith('cbs_') ? 'israel_cbs' : jobKey.startsWith('fred_') ? 'fred' : jobKey.startsWith('us_treasury_') ? 'us_treasury' : jobKey.startsWith('boi_credit_') ? 'boi_credit_spreads' : 'bank_of_israel';
    await db.prepare('UPDATE data_sources SET last_error_at = ?, last_error_message = ?, updated_at = ? WHERE key = ?').bind(completedAt, message.slice(0, 500), completedAt, sourceKey).run();
  }
}

async function ingestPolicyRate(db: D1Database): Promise<void> {
  await runWithStatus(db, 'boi_policy_rate', async (startedAt) => {
    const response = await fetchJson<unknown>(BOI_RATE_URL);
    const data = parsePolicyRate(response.body);
    const date = todayUtc();
    const written = await insertRevision(db, 'macro_observations', {
      series_id: 'boi_policy_rate', observation_date: date, value: data.value,
      source_timestamp: null, ingested_at: startedAt, raw_payload_hash: response.rawHash,
    }, ['boi_policy_rate', date], response.rawHash);
    return { read: 1, written, details: { currentInterest: data.value, nextDecisionDate: data.nextDecisionDate, sourceUrl: response.sourceUrl } };
  });
}

async function ingestCpi(db: D1Database): Promise<void> {
  await runWithStatus(db, 'cbs_cpi', async (startedAt) => {
    const { rows, response, formatUsed } = await fetchCbsCpiWithFallback(CBS_CPI_JSON_URL, CBS_CPI_XML_URL);
    const writes: D1PreparedStatement[] = [];
    let changed = 0;
    for (const row of rows) {
      const revision = buildRevisionInsert('macro_observations', { series_id: 'cpi_index', observation_date: row.date, value: row.value, source_timestamp: row.sourceTimestamp, ingested_at: startedAt, raw_payload_hash: row.hash }, ['cpi_index', row.date], row.hash);
      writes.push(db.prepare(revision.sql).bind(...revision.values));
    }
    for (let index = 0; index < writes.length; index += 100) {
      const results = await db.batch(writes.slice(index, index + 100));
      changed += results.reduce((sum, result) => sum + result.meta.changes, 0);
    }
    return { read: rows.length, written: changed, details: { sourceUrl: response.sourceUrl, payloadHash: response.rawHash, formatUsed, rowsRead: rows.length, rowsWritten: changed, latestDate: rows.at(-1)?.date ?? null, observationThrough: rows.at(-1)?.date ?? null } };
  });
}

async function persistMacroRows(db: D1Database, seriesId: string, rows: Array<{ date: string; value: number; sourceTimestamp: string | null; hash: string }>, ingestedAt: string): Promise<number> {
  const statements = rows.map((row) => {
    const revision = buildRevisionInsert('macro_observations', { series_id: seriesId, observation_date: row.date, value: row.value, source_timestamp: row.sourceTimestamp, ingested_at: ingestedAt, raw_payload_hash: row.hash }, [seriesId, row.date], row.hash);
    return db.prepare(revision.sql).bind(...revision.values);
  });
  let changed = 0;
  for (let index = 0; index < statements.length; index += 100) {
    const result = await db.batch(statements.slice(index, index + 100));
    changed += result.reduce((sum, item) => sum + item.meta.changes, 0);
  }
  return changed;
}

async function ingestInflationExpectations(db: D1Database): Promise<void> {
  await runWithStatus(db, 'boi_inflation_expectations', async (startedAt) => {
    const response = await fetchWorkbook(BOI_EXPECTATIONS_URL);
    const series = await parseBoiInflationExpectations(response.buffer, response.sourceTimestamp);
    let written = 0;
    let read = 0;
    for (const [key, seriesId] of Object.entries({ il_bei_1y: 'il_bei_1y', il_bei_5y: 'il_bei_5y', il_bei_5y5y: 'il_bei_5y5y', il_forecast_cpi_12m: 'il_forecast_cpi_12m' })) {
      const rows = series[key as keyof typeof series];
      read += rows.length;
      written += await persistMacroRows(db, seriesId, rows, startedAt);
    }
    return { read, written, details: { sourceUrl: response.sourceUrl, sourcePage: BOI_EXPECTATIONS_PAGE, payloadHash: response.rawHash, publicationDate: response.sourceTimestamp, observationThrough: series.il_bei_1y.at(-1)?.date } };
  });
}

async function ingestUsdIls(db: D1Database): Promise<void> {
  await runWithStatus(db, 'boi_usdils', async (startedAt) => {
    const yearStart = `${new Date().getUTCFullYear() - 1}-01-01`;
    const historyUrl = `${BOI_USD_HISTORY_URL}?startperiod=${yearStart}&endperiod=${todayUtc()}&format=csv`;
    const [historyResponse, currentResponse] = await Promise.all([fetchText(historyUrl), fetchJson<unknown>(BOI_USD_RATE_URL)]);
    const historyRows = await parseBoiExchangeHistory(historyResponse.text, historyResponse.sourceTimestamp);
    const current = await parseBoiExchangeRate(currentResponse.body);
    const currentRow = { date: current.date, value: current.value, sourceTimestamp: current.sourceTimestamp, hash: current.hash };
    const merged = new Map(historyRows.map((row) => [row.date, row]));
    merged.set(currentRow.date, currentRow);
    const rows = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
    const written = await persistMacroRows(db, 'usd_ils', rows, startedAt);
    return { read: rows.length, written, details: { historyUrl, currentUrl: BOI_USD_RATE_URL, historyHash: historyResponse.rawHash, currentHash: currentResponse.rawHash, currentFixingTimestamp: current.sourceTimestamp } };
  });
}

async function treasuryYearUrls(db: D1Database): Promise<{ startDate: string; urls: number[] }> {
  const settings = await getDashboardSettings(db);
  const calendarDays = Math.max(400, Math.floor(setting(settings, 'us_yield_lookback_calendar_days', 450)));
  const start = new Date(); start.setUTCDate(start.getUTCDate() - calendarDays);
  const currentYear = new Date().getUTCFullYear();
  return { startDate: start.toISOString().slice(0, 10), urls: Array.from({ length: currentYear - start.getUTCFullYear() + 1 }, (_, index) => start.getUTCFullYear() + index) };
}

function treasuryCsvUrl(year: number, curve: 'daily_treasury_yield_curve' | 'daily_treasury_real_yield_curve'): string {
  return `${US_TREASURY_NOMINAL_CSV_URL}/${year}/all?type=${curve}`;
}

async function ingestUsTreasuryNominal(db: D1Database): Promise<void> {
  await runWithStatus(db, 'us_treasury_nominal', async (startedAt) => {
    const { startDate, urls } = await treasuryYearUrls(db);
    const responses = await Promise.all(urls.map((year) => fetchText(treasuryCsvUrl(year, 'daily_treasury_yield_curve'), 'text/csv')));
    const bySeries: Record<'twoYear' | 'tenYear', Map<string, Awaited<ReturnType<typeof parseTreasuryNominalCurve>>['twoYear'][number]>> = { twoYear: new Map(), tenYear: new Map() };
    for (const response of responses) {
      const rows = await parseTreasuryNominalCurve(response.text, response.sourceTimestamp);
      for (const key of ['twoYear', 'tenYear'] as const) for (const row of rows[key]) if (row.date >= startDate) bySeries[key].set(row.date, row);
    }
    const twoYear = [...bySeries.twoYear.values()].sort((a,b)=>a.date.localeCompare(b.date));
    const tenYear = [...bySeries.tenYear.values()].sort((a,b)=>a.date.localeCompare(b.date));
    const written = (await persistMacroRows(db, 'ust_2y_nominal', twoYear, startedAt)) + (await persistMacroRows(db, 'ust_10y_nominal', tenYear, startedAt));
    return { read: twoYear.length + tenYear.length, written, details: { sourceUrls: urls.map((year) => treasuryCsvUrl(year, 'daily_treasury_yield_curve')), rowsRead: twoYear.length + tenYear.length, latestDate: tenYear.at(-1)?.date ?? null } };
  });
}

async function ingestUsTreasuryReal(db: D1Database): Promise<void> {
  await runWithStatus(db, 'us_treasury_real', async (startedAt) => {
    const { startDate, urls } = await treasuryYearUrls(db);
    const responses = await Promise.all(urls.map((year) => fetchText(treasuryCsvUrl(year, 'daily_treasury_real_yield_curve'), 'text/csv')));
    const observations = new Map<string, Awaited<ReturnType<typeof parseTreasuryRealCurve>>[number]>();
    for (const response of responses) for (const row of await parseTreasuryRealCurve(response.text, response.sourceTimestamp)) if (row.date >= startDate) observations.set(row.date, row);
    const rows = [...observations.values()].sort((a,b)=>a.date.localeCompare(b.date));
    const written = await persistMacroRows(db, 'ust_10y_real', rows, startedAt);
    return { read: rows.length, written, details: { sourceUrls: urls.map((year) => treasuryCsvUrl(year, 'daily_treasury_real_yield_curve')), rowsRead: rows.length, latestDate: rows.at(-1)?.date ?? null } };
  });
}

async function ingestCurve(db: D1Database, curveType: 'nominal' | 'real', sourceUrl: string): Promise<void> {
  await runWithStatus(db, `boi_${curveType}_curve`, async (startedAt) => {
    const response = await fetchWorkbook(sourceUrl);
    const points = parseBoiCurve(response.buffer);
    const writes: D1PreparedStatement[] = [];
    for (const point of points) {
      const rowHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${curveType}:${point.date}:${point.tenorYears}:${point.value}`));
      const hash = [...new Uint8Array(rowHash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const revision = buildRevisionInsert('yield_curve_observations', { curve_type: curveType, tenor_years: point.tenorYears, observation_date: point.date, value: point.value, source_timestamp: null, ingested_at: startedAt, raw_payload_hash: hash }, [curveType, point.tenorYears, point.date], hash);
      writes.push(db.prepare(revision.sql).bind(...revision.values));
    }
    let changed = 0;
    for (let index = 0; index < writes.length; index += 100) {
      const results = await db.batch(writes.slice(index, index + 100));
      changed += results.reduce((sum, result) => sum + result.meta.changes, 0);
    }
    return { read: points.length, written: changed, details: { sourceUrl, sourcePage: BOI_CURVE_PAGE, payloadHash: response.rawHash, observationThrough: points.reduce((latest, point) => point.date > latest ? point.date : latest, '') } };
  });
}

async function ingestAll(db: D1Database): Promise<void> {
  await ingestPolicyRate(db);
  await ingestCpi(db);
  await ingestCurve(db, 'nominal', BOI_NOMINAL_CURVE_URL);
  await ingestCurve(db, 'real', BOI_REAL_CURVE_URL);
  await ingestInflationExpectations(db);
  await ingestUsdIls(db);
  await ingestUsTreasuryNominal(db);
  await ingestUsTreasuryReal(db);
  await ingestCreditSpreads(db);
}

async function runProductionIngestion(db: D1Database): Promise<void> {
  await ingestAll(db);
  await refreshBondBenchmarks(db);
  const overview = await getOverview(db);
  await persistSignalSnapshots(db, overview.signals);
  await persistRegimeSnapshot(db, overview);
}

interface ManualIngestionRunDb { job_key: string; status: string; records_read: number; records_written: number; details_json: string | null; error_message: string | null; }
let manualIngestionRunning = false;

async function manualIngestionSources(db: D1Database, startedAt: string) {
  const result = await db.prepare('SELECT job_key,status,records_read,records_written,details_json,error_message FROM ingestion_runs WHERE started_at >= ? ORDER BY started_at').bind(startedAt).all<ManualIngestionRunDb>();
  const sources: Record<string, Record<string, unknown>> = {};
  for (const run of result.results) {
    let details: Record<string, unknown> = {};
    try { details = JSON.parse(run.details_json ?? '{}') as Record<string, unknown>; } catch { /* Invalid diagnostics are omitted. */ }
    const key = run.job_key === 'boi_credit_spreads' ? 'boiCreditSpreads' : run.job_key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    const source: Record<string, unknown> = { ok: run.status === 'success', rowsRead: run.records_read ?? 0, rowsWritten: run.records_written ?? 0 };
    if (run.job_key.startsWith('us_treasury_')) source.latestDate = typeof details.latestDate === 'string' ? details.latestDate : null;
    if (run.job_key === 'cbs_cpi') {
      source.formatUsed = details.formatUsed === 'xml' || details.formatUsed === 'json' ? details.formatUsed : null;
      source.rowsRead = run.records_read ?? 0;
      source.rowsWritten = run.records_written ?? 0;
      source.latestDate = typeof details.latestDate === 'string' ? details.latestDate : null;
      if (run.status !== 'success') source.failureKind = /CBS_CPI_TIMEOUT/.test(run.error_message ?? '') ? 'timeout' : /CBS_CPI_MALFORMED/.test(run.error_message ?? '') ? 'malformed' : 'unavailable';
    }
    if (run.job_key === 'boi_credit_spreads') {
      source.rowsFetched = typeof details.rowsFetched === 'number' ? details.rowsFetched : null;
      source.spreadRows = run.records_read ?? 0;
      source.seriesDiscovered = typeof details.seriesDiscovered === 'number' ? details.seriesDiscovered : 0;
      source.latestPeriod = typeof details.observationThrough === 'string' ? details.observationThrough : null;
    }
    if (run.status !== 'success') source.error = 'source_ingestion_failed';
    sources[key] = source;
  }
  return sources;
}

async function handleManualIngestion(request: Request, env: Env, runPipeline: (db: D1Database) => Promise<void> = runProductionIngestion): Promise<Response> {
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405, headers: { 'content-type': 'application/json; charset=utf-8', Allow: 'POST', 'cache-control': 'no-store' } });
  const authorization = request.headers.get('Authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.ADMIN_INGEST_TOKEN) return json({ ok: false, error: 'admin_ingest_not_configured' }, 503);
  if (match[1] !== env.ADMIN_INGEST_TOKEN) return json({ ok: false, error: 'forbidden' }, 403);
  if (manualIngestionRunning) return json({ ok: false, error: 'ingestion_already_running' }, 409);

  manualIngestionRunning = true;
  const startedAt = nowIso();
  console.log('Manual ingestion started', 'production_pipeline');
  try {
    await runPipeline(env.DB);
    const finishedAt = nowIso();
    const sources = await manualIngestionSources(env.DB, startedAt);
    const ok = Object.values(sources).every((source) => source.ok === true);
    sources.fredCrossCheck = { ok: null, status: 'not_run', reason: 'optional_cross_check_not_required_for_production_data' };
    console.log('Manual ingestion completed', 'production_pipeline', Object.keys(sources).length);
    return json({ ok, startedAt, finishedAt, sources });
  } catch (error) {
    const category = error instanceof Error ? 'pipeline_failed' : 'pipeline_failed';
    console.error('Manual ingestion failed', category);
    return json({ ok: false, startedAt, finishedAt: nowIso(), error: category, sources: {} }, 500);
  } finally {
    manualIngestionRunning = false;
  }
}

async function getBoiCreditMetadata(db: D1Database, rows: Awaited<ReturnType<typeof parseBoiCreditCsv>>, now = nowIso()): Promise<CreditMetadata> {
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  const getCached = async (key: string): Promise<Record<string, string> | null> => {
    const row = await db.prepare('SELECT fetched_at,payload_hash,entries_json FROM credit_metadata_cache WHERE codelist_id=?').bind(key).first<{ fetched_at: string; payload_hash: string; entries_json: string }>();
    if (!row) return null;
    try { return JSON.parse(row.entries_json) as Record<string, string>; } catch { return null; }
  };
  const cacheFresh = async (key: string): Promise<boolean> => {
    const row = await db.prepare('SELECT fetched_at FROM credit_metadata_cache WHERE codelist_id=?').bind(key).first<{ fetched_at: string }>();
    return !!row && Date.parse(now) - Date.parse(row.fetched_at) < maxAgeMs;
  };
  const save = async (key: string, xml: string, entries: Record<string, string>): Promise<void> => {
    await db.prepare('INSERT INTO credit_metadata_cache(codelist_id,fetched_at,payload_hash,entries_json) VALUES(?,?,?,?) ON CONFLICT(codelist_id) DO UPDATE SET fetched_at=excluded.fetched_at,payload_hash=excluded.payload_hash,entries_json=excluded.entries_json')
      .bind(key, now, await sha256Text(xml), JSON.stringify(entries)).run();
  };

  let refs = await getCached('__SECDWH_DSD__');
  if (!(await cacheFresh('__SECDWH_DSD__'))) {
    try {
      const dsdXml = await fetchBoiXml(BOI_SECDWH_DSD_URL);
      const found = parseBoiDsdCodelistRefs(dsdXml);
      if (Object.keys(found).length) { refs = found; await save('__SECDWH_DSD__', dsdXml, found); }
    } catch { /* Cached official metadata remains usable; unresolved codes stay explicit. */ }
  }
  refs ??= {};
  const neededCodes: Record<string, Set<string>> = {
    COMP_CATEGORY: new Set(rows.map((row) => row.compCategoryCode).filter(Boolean)),
    COMP_NAME: new Set(rows.map((row) => row.compNameCode).filter(Boolean)),
    INDEXATION_TYPE: new Set(rows.map((row) => row.indexationTypeCode).filter(Boolean)),
    SEC_RANK_GROUP: new Set(rows.map((row) => row.secRankGroupCode).filter(Boolean)),
    ISSUER_SECTOR: new Set(rows.map((row) => row.issuerSectorCode).filter(Boolean)),
    UNIT_MEASURE: new Set(rows.map((row) => row.unitMeasure).filter(Boolean)),
  };
  const codelists: Record<string, Record<string, string>> = {};
  for (const [dimension, codelistId] of Object.entries(refs)) {
    let entries = await getCached(codelistId);
    const required = neededCodes[dimension] ?? new Set<string>();
    if (!(await cacheFresh(codelistId)) || [...required].some((code) => !entries?.[code])) {
      try {
        const xml = await fetchBoiXml(`https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/structure/codelist/BOI.STATISTICS/${encodeURIComponent(codelistId)}/1.0`);
        const allOfficialEntries = parseBoiCodelist(xml);
        const officialEntries = Object.fromEntries([...required].map((code) => [code, allOfficialEntries[code] ?? '__UNRESOLVED__']));
        if (Object.keys(officialEntries).length) { entries = officialEntries; await save(codelistId, xml, officialEntries); }
      } catch { /* Keep the last successful copy, if one exists. */ }
    }
    codelists[dimension] = entries ?? {};
  }
  return { codelists, fetchedAt: now, unresolvedCount: 0 };
}

async function ingestCreditSpreads(db: D1Database): Promise<void> {
  await runWithStatus(db, 'boi_credit_spreads', async (startedAt) => {
    const response = await fetchText(BOI_SECDWH_CSV_URL);
    const rows = await parseBoiCreditCsv(response.text);
    const metadata = await getBoiCreditMetadata(db, rows, startedAt);
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) grouped.set(row.seriesCode, [...(grouped.get(row.seriesCode) ?? []), row]);
    const seriesStatements: D1PreparedStatement[] = [];
    const observationStatements: D1PreparedStatement[] = [];
    for (const [seriesCode, seriesRows] of grouped) {
      const latestRow = seriesRows.at(-1)!;
    const meta = {
        compCategoryLabel: resolveOfficialLabel(metadata, 'COMP_CATEGORY', latestRow.compCategoryCode),
        compNameLabel: resolveOfficialLabel(metadata, 'COMP_NAME', latestRow.compNameCode),
        indexationTypeLabel: resolveOfficialLabel(metadata, 'INDEXATION_TYPE', latestRow.indexationTypeCode),
        secRankGroupLabel: resolveOfficialLabel(metadata, 'SEC_RANK_GROUP', latestRow.secRankGroupCode),
        issuerSectorLabel: resolveOfficialLabel(metadata, 'ISSUER_SECTOR', latestRow.issuerSectorCode),
        unitMeasureLabel: resolveOfficialLabel(metadata, 'UNIT_MEASURE', latestRow.unitMeasure),
      };
      const metadataJson = JSON.stringify({ ...latestRow, ...meta, boiDataflow: 'BOI.STATISTICS:SECDWH:1.0' });
      seriesStatements.push(db.prepare(`INSERT INTO credit_spread_series(series_code,frequency,comp_category_code,comp_category_label,comp_name_code,comp_name_label,indexation_type_code,indexation_type_label,sec_rank_group_code,sec_rank_group_label,issuer_sector_code,issuer_sector_label,unit_measure,unit_measure_label,source,metadata_json,first_seen_at,last_seen_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(series_code) DO UPDATE SET frequency=excluded.frequency,comp_category_code=excluded.comp_category_code,comp_category_label=excluded.comp_category_label,comp_name_code=excluded.comp_name_code,comp_name_label=excluded.comp_name_label,indexation_type_code=excluded.indexation_type_code,indexation_type_label=excluded.indexation_type_label,sec_rank_group_code=excluded.sec_rank_group_code,sec_rank_group_label=excluded.sec_rank_group_label,issuer_sector_code=excluded.issuer_sector_code,issuer_sector_label=excluded.issuer_sector_label,unit_measure=excluded.unit_measure,unit_measure_label=excluded.unit_measure_label,source=excluded.source,metadata_json=excluded.metadata_json,last_seen_at=excluded.last_seen_at`)
        .bind(seriesCode, latestRow.frequency, latestRow.compCategoryCode, meta.compCategoryLabel, latestRow.compNameCode, meta.compNameLabel, latestRow.indexationTypeCode, meta.indexationTypeLabel, latestRow.secRankGroupCode, meta.secRankGroupLabel, latestRow.issuerSectorCode, meta.issuerSectorLabel, latestRow.unitMeasure, meta.unitMeasureLabel, 'Bank of Israel SECDWH', metadataJson, startedAt, startedAt));
      for (const row of seriesRows) {
        observationStatements.push(db.prepare(`INSERT OR IGNORE INTO credit_spread_observations(series_code,time_period,observation_value,release_status,payload_hash,ingested_at,revision_number)
          SELECT ?,?,?,?,?,?,COALESCE((SELECT MAX(revision_number)+1 FROM credit_spread_observations WHERE series_code=? AND time_period=?),1)`)
          .bind(row.seriesCode, row.timePeriod, row.observationValue, row.releaseStatus, row.payloadHash, startedAt, row.seriesCode, row.timePeriod));
      }
    }
    const batchRun = async (statements: D1PreparedStatement[]) => {
      let changed = 0;
      for (let i = 0; i < statements.length; i += 100) {
        const result = await db.batch(statements.slice(i, i + 100));
        changed += result.reduce((total, item) => total + item.meta.changes, 0);
      }
      return changed;
    };
    await batchRun(seriesStatements);
    const written = await batchRun(observationStatements);
    const rowsFetched = Math.max(0, response.text.split(/\r?\n/).filter((line) => line.trim()).length - 1);
    return { read: rows.length, written, details: { rowsFetched, sourceUrl: response.sourceUrl, sourcePage: BOI_SECDWH_PAGE_URL, metadataUrl: BOI_SECDWH_DSD_URL, flowMetadataUrl: BOI_SECDWH_FLOW_URL, payloadHash: response.rawHash, seriesDiscovered: grouped.size, observationThrough: rows.at(-1)?.timePeriod, metadataCodelists: Object.keys(metadata.codelists) } };
  });
}

interface CreditSeriesDb {
  series_code: string; frequency: string | null; comp_category_code: string | null; comp_category_label: string | null;
  comp_name_code: string | null; comp_name_label: string | null; indexation_type_code: string | null; indexation_type_label: string | null;
  sec_rank_group_code: string | null; sec_rank_group_label: string | null; issuer_sector_code: string | null; issuer_sector_label: string | null;
  unit_measure: string | null; unit_measure_label: string | null; source: string; metadata_json: string; first_seen_at: string; last_seen_at: string;
}
interface CreditObservationDb { time_period: string; observation_value: number; release_status: string | null; payload_hash: string; ingested_at: string; revision_number: number; }

async function creditSourceStatus(db: D1Database) {
  const [source, count, latest] = await Promise.all([
    db.prepare('SELECT last_success_at,last_error_at,last_error_message FROM data_sources WHERE key=?').bind('boi_credit_spreads').first<{ last_success_at: string | null; last_error_at: string | null; last_error_message: string | null }>(),
    db.prepare('SELECT COUNT(*) AS observations,COUNT(DISTINCT series_code) AS series FROM latest_credit_spread_observations').first<{ observations: number; series: number }>(),
    db.prepare('SELECT MAX(time_period) AS latest_period FROM latest_credit_spread_observations').first<{ latest_period: string | null }>(),
  ]);
  return { name: 'BOI SECDWH corporate spreads', sourceUrl: BOI_SECDWH_CSV_URL, sourcePage: BOI_SECDWH_PAGE_URL,
    lastSuccessAt: source?.last_success_at ?? null, lastErrorAt: source?.last_error_at ?? null, lastError: source?.last_error_message ?? null,
    latestObservationPeriod: latest?.latest_period ?? null, observationCount: count?.observations ?? 0, seriesCount: count?.series ?? 0,
    stale: latest?.latest_period ? isCreditSeriesStale(latest.latest_period) : true, status: !latest?.latest_period ? 'pending' : isCreditSeriesStale(latest.latest_period) ? 'stale' : source?.last_error_at && (!source.last_success_at || source.last_error_at > source.last_success_at) ? 'error' : 'healthy' };
}

function seriesLabel(row: CreditSeriesDb): string {
  const labels = [row.comp_name_label, row.issuer_sector_label, row.sec_rank_group_label].filter((label): label is string => !!label && !label.includes('לא זוהה במטא־דאטה') && label !== 'לא זמין');
  return labels.length ? [...new Set(labels)].join(' · ') : `${row.series_code} — לא זוהה במטא־דאטה`;
}

async function creditHistory(db: D1Database, code: string): Promise<CreditObservationDb[]> {
  const rows = await db.prepare('SELECT time_period,observation_value,release_status,payload_hash,ingested_at,revision_number FROM latest_credit_spread_observations WHERE series_code=? ORDER BY time_period').bind(code).all<CreditObservationDb>();
  return rows.results;
}

async function creditSeriesPayload(db: D1Database, row: CreditSeriesDb) {
  const history = await creditHistory(db, row.series_code);
  const latest = history.at(-1) ?? null;
  const changes = creditChanges(history.map((row) => ({ timePeriod: row.time_period, observationValue: row.observation_value })), row.unit_measure === 'PT' || row.unit_measure === 'PD' ? 100 : null);
  const label = seriesLabel(row);
  return { seriesCode: row.series_code, label, frequency: row.frequency, compCategoryCode: row.comp_category_code, compCategoryLabel: row.comp_category_label,
    compNameCode: row.comp_name_code, compNameLabel: row.comp_name_label, indexationTypeCode: row.indexation_type_code, indexationTypeLabel: row.indexation_type_label,
    secRankGroupCode: row.sec_rank_group_code, secRankGroupLabel: row.sec_rank_group_label, issuerSectorCode: row.issuer_sector_code, issuerSectorLabel: row.issuer_sector_label,
    unitMeasure: row.unit_measure, unitMeasureLabel: row.unit_measure_label, source: row.source, sourceUrl: BOI_SECDWH_PAGE_URL, metadata: JSON.parse(row.metadata_json),
    latest: latest ? { timePeriod: latest.time_period, value: latest.observation_value, releaseStatus: latest.release_status } : null,
    latestObservationPeriod: latest?.time_period ?? null, ...changes, stale: latest ? isCreditSeriesStale(latest.time_period) : true,
    metadataResolved: [row.comp_category_label, row.comp_name_label, row.indexation_type_label, row.sec_rank_group_label, row.issuer_sector_label, row.unit_measure_label].filter((value) => !!value && !value.includes('לא זוהה במטא־דאטה')).length,
    history: history.map((item) => ({ timePeriod: item.time_period, value: item.observation_value, releaseStatus: item.release_status, ingestedAt: item.ingested_at, revision: item.revision_number })) };
}

async function getCreditSeries(db: D1Database) {
  const rows = await db.prepare('SELECT * FROM credit_spread_series ORDER BY series_code').all<CreditSeriesDb>();
  return Promise.all(rows.results.map((row) => creditSeriesPayload(db, row)));
}

async function getCreditSummary(db: D1Database) {
  const [series, sourceStatus] = await Promise.all([getCreditSeries(db), creditSourceStatus(db)]);
  const present = series.filter((row) => row.latest);
  const periods = new Map<string, number>();
  for (const row of present) for (const point of row.history) periods.set(point.timePeriod, (periods.get(point.timePeriod) ?? 0) + 1);
  const commonPeriod = [...periods].filter(([, count]) => count === present.length).map(([period]) => period).sort().at(-1) ?? null;
  const threeMonth = present.filter((row) => row.change3m !== null);
  const widest = [...present].sort((a, b) => a.latest!.value - b.latest!.value).at(-1) ?? null;
  const narrowest = [...present].sort((a, b) => a.latest!.value - b.latest!.value)[0] ?? null;
  const largestWidening = [...threeMonth].sort((a, b) => (b.change3m ?? 0) - (a.change3m ?? 0))[0] ?? null;
  const largestNarrowing = [...threeMonth].sort((a, b) => (a.change3m ?? 0) - (b.change3m ?? 0))[0] ?? null;
  const unresolvedSeriesCount = series.filter((row) => [row.compCategoryLabel,row.compNameLabel,row.indexationTypeLabel,row.secRankGroupLabel,row.issuerSectorLabel,row.unitMeasureLabel].some((value) => !!value && value.includes('לא זוהה במטא־דאטה'))).length;
  const bullets = series.flatMap((row) => [creditChangeBullet(row.label, row.change1m, 1), creditChangeBullet(row.label, row.change3m, 3)]).filter((line): line is string => !!line);
  return { seriesCount: series.length, latestCommonObservationPeriod: commonPeriod,
    widestCurrentSpread: widest ? { seriesCode: widest.seriesCode, label: widest.label, value: widest.latest!.value, timePeriod: widest.latest!.timePeriod } : null,
    narrowestCurrentSpread: narrowest ? { seriesCode: narrowest.seriesCode, label: narrowest.label, value: narrowest.latest!.value, timePeriod: narrowest.latest!.timePeriod } : null,
    largest3mWidening: largestWidening ? { seriesCode: largestWidening.seriesCode, label: largestWidening.label, changeBp: largestWidening.change3m } : null,
    largest3mNarrowing: largestNarrowing ? { seriesCode: largestNarrowing.seriesCode, label: largestNarrowing.label, changeBp: largestNarrowing.change3m } : null,
    coverage: { seriesWithData: present.length, seriesWithoutData: series.length - present.length, metadataResolvedSeries: series.length - unresolvedSeriesCount, metadataUnresolvedSeries: unresolvedSeriesCount }, sourceStatus, changes: { bullets } };
}

async function getHistory(db: D1Database, seriesId: string, limit = 500): Promise<DbObservation[]> {
  const result = await db.prepare('SELECT observation_date, value, ingested_at, source_timestamp, revision_number FROM latest_macro_observations WHERE series_id = ? ORDER BY observation_date DESC LIMIT ?')
    .bind(seriesId, limit).all<DbObservation>();
  return result.results.reverse();
}

function toObservation(row: DbObservation): Observation {
  return { observationDate: row.observation_date, value: row.value, ingestedAt: row.ingested_at, sourceTimestamp: row.source_timestamp, revisionNumber: row.revision_number };
}

function createRealYieldDifferential(diffCurrent: number | null, signal: Signal | undefined, ingestedAt = nowIso(), status?: SourceStatus['status']): MarketSeries {
  const change = signal?.value.changeBps;
  const currentYear = new Date().getUTCFullYear();
  return { key: 'il_us_real_yield_differential', value: diffCurrent, unit: 'bp', observationDate: signal?.observationDate ?? null, sourceTimestamp: null, ingestedAt, revisionNumber: null, source: 'בנק ישראל + U.S. Treasury', sourceUrl: BOI_REAL_CURVE_URL, sourceUrls: [BOI_REAL_CURVE_URL, treasuryCsvUrl(currentYear, 'daily_treasury_real_yield_curve')], status: status ?? (diffCurrent === null ? 'pending' : 'ok'), derived: true, provenance: 'הפרש בין תשואה ריאלית ל־10 שנים בישראל לבין תשואה ריאלית ל־10 שנים בארה״ב; מבוסס על התצפיות הזמינות בתאריכים בני השוואה.', changes: { changeBps: typeof change === 'number' ? change : null }, history: [] };
}

function cpiStats(rows: DbObservation[]) {
  const indexByMonth = new Map(rows.map((row) => [row.observation_date.slice(0, 7), row.value]));
  const latest = rows.at(-1);
  if (!latest) return { latestIndex: null, mom: null, yoy: null, previousYoy: null, observationDate: null };
  const latestMonth = latest.observation_date.slice(0, 7);
  const [year, month] = latestMonth.split('-').map(Number);
  const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const previousMonth = previousMonthDate.toISOString().slice(0, 7);
  const yearAgoDate = new Date(Date.UTC(year, month - 13, 1));
  const yearAgoMonth = yearAgoDate.toISOString().slice(0, 7);
  const twoYearsAgoDate = new Date(Date.UTC(year, month - 25, 1));
  const twoYearsAgoMonth = twoYearsAgoDate.toISOString().slice(0, 7);
  const previous = indexByMonth.get(previousMonth);
  const yearAgo = indexByMonth.get(yearAgoMonth);
  const twoYearsAgo = indexByMonth.get(twoYearsAgoMonth);
  return {
    latestIndex: latest.value,
    mom: previous === undefined ? null : percentChange(latest.value, previous),
    yoy: yearAgo === undefined ? null : percentChange(latest.value, yearAgo),
    previousYoy: previous === undefined || twoYearsAgo === undefined ? null : percentChange(previous, twoYearsAgo),
    observationDate: latest.observation_date,
  };
}

async function getCurve(db: D1Database, type: 'nominal' | 'real', limit = 5000): Promise<YieldPoint[]> {
  const result = await db.prepare('SELECT observation_date AS date, tenor_years AS tenorYears, value, ingested_at AS ingestedAt, source_timestamp AS sourceTimestamp, revision_number AS revisionNumber FROM latest_yield_curve_observations WHERE curve_type = ? ORDER BY observation_date DESC, tenor_years LIMIT ?')
    .bind(type, limit).all<YieldPoint>();
  return result.results.reverse();
}

function asSignal(definition: DbSignalDefinition, status: SignalStatus, value: Signal['value'], explanationHe: string, observationDate: string | null, score: number | null = null): Signal {
  return { key: definition.key, nameHe: definition.name_he, status, score, value, explanationHe, observationDate, weight: definition.weight };
}

async function getSignalDefinitions(db: D1Database): Promise<DbSignalDefinition[]> {
  const result = await db.prepare('SELECT key, name_he, description_he, weight FROM signal_definitions WHERE enabled = 1 ORDER BY weight DESC').all<DbSignalDefinition>();
  return result.results;
}

async function getDashboardSettings(db: D1Database): Promise<Record<string, number>> {
  const rows = await db.prepare('SELECT key, value_json FROM dashboard_settings').all<DbSetting>();
  return Object.fromEntries(rows.results.map((row) => [row.key, Number(JSON.parse(row.value_json))]));
}

function setting(settings: Record<string, number>, key: string, fallback: number): number {
  const value = settings[key];
  return Number.isFinite(value) ? value : fallback;
}

async function buildSignals(db: D1Database, definitions: DbSignalDefinition[], settings: Record<string, number>, cpiRows: DbObservation[], realYields: YieldPoint[], nominalYields: YieldPoint[], expectations: Record<string, DbObservation[]>, usdRows: DbObservation[], usNominalRows: DbObservation[], usRealRows: DbObservation[], sources: SourceStatus[]): Promise<Signal[]> {
  const defs = definitions;
  const byKey = new Map(defs.map((definition) => [definition.key, definition]));
  const rateLookback = Math.max(1, Math.floor(setting(settings, 'rate_lookback_observations', 20)));
  const rateRows = await getHistory(db, 'boi_policy_rate', rateLookback + 1);
  const cpi = cpiStats(cpiRows);
  const latestRate = rateRows.at(-1) ?? null;
  const priorRate = rateRows.length > 1 ? rateRows[Math.max(0, rateRows.length - rateLookback - 1)] : null;
  const rateDelta = latestRate && priorRate ? latestRate.value - priorRate.value : null;
  const sourceMap = new Map(sources.map((source) => [source.key, source]));
  const rateThreshold = setting(settings, 'policy_rate_change_threshold', 0.01);
  let rateStatus: SignalStatus = rateDelta === null ? 'unknown' : rateDelta <= -rateThreshold ? 'green' : rateDelta >= rateThreshold ? 'red' : 'yellow';
  if (sourceMap.get('boi_policy_rate')?.status !== 'ok') rateStatus = 'unknown';
  const rate = byKey.get('policy_rate');
  const cpiDefinition = byKey.get('cpi_inflation');
  const realRows = realYields.filter((row) => row.tenorYears === 10).sort((a, b) => a.date.localeCompare(b.date));
  const latestReal = realRows.at(-1) ?? null;
  const target20 = latestReal ? new Date(`${latestReal.date}T00:00:00Z`) : null;
  if (target20) target20.setUTCDate(target20.getUTCDate() - setting(settings, 'yield_comparison_days', 30));
  const priorMonthYield = target20 ? [...realRows].reverse().find((row) => row.date <= target20.toISOString().slice(0, 10)) ?? null : null;
  const realChangeBps = latestReal && priorMonthYield ? (latestReal.value - priorMonthYield.value) * 100 : null;
  const yieldThreshold = setting(settings, 'yield_monthly_change_threshold_bps', 5);
  const nominalRows = nominalYields.filter((row) => row.tenorYears === 10).sort((a, b) => a.date.localeCompare(b.date));
  const latestNominal = nominalRows.at(-1) ?? null;
  const nominalTarget = latestNominal ? new Date(`${latestNominal.date}T00:00:00Z`) : null;
  if (nominalTarget) nominalTarget.setUTCDate(nominalTarget.getUTCDate() - setting(settings, 'yield_comparison_days', 30));
  const priorNominal = nominalTarget ? [...nominalRows].reverse().find((row) => row.date <= nominalTarget.toISOString().slice(0, 10)) ?? null : null;
  const nominalChangeBps = latestNominal && priorNominal ? (latestNominal.value - priorNominal.value) * 100 : null;
  const currentExpectations = Object.fromEntries(Object.entries(expectations).map(([key, rows]) => [key, rows.at(-1) ?? null]));
  const previousOneYearExpectation = expectations.il_bei_1y?.at(-2) ?? null;
  const expected1y = currentExpectations.il_bei_1y?.value ?? null;
  const expectedValues = ['il_bei_1y', 'il_bei_5y', 'il_bei_5y5y', 'il_forecast_cpi_12m'].map((key) => currentExpectations[key]?.value ?? null);
  const targetLow = setting(settings, 'inflation_target_low', 1);
  const targetHigh = setting(settings, 'inflation_target_high', 3);
  const materialExpectationRise = setting(settings, 'inflation_material_rise', 0.3);
  let expectationsStatus: SignalStatus = expectedValues.some((value) => value === null) ? 'unknown'
    : expectedValues.some((value) => value! > targetHigh) || (expected1y !== null && previousOneYearExpectation !== null && expected1y - previousOneYearExpectation.value > materialExpectationRise) ? 'red'
      : expectedValues.every((value) => value! >= targetLow && value! <= targetHigh) && expected1y !== null && previousOneYearExpectation !== null && expected1y <= previousOneYearExpectation.value ? 'green' : 'yellow';
  const realDefinition = byKey.get('long_real_yield');
  const trendDefinition = byKey.get('long_yield_momentum');
  const expectationDefinition = byKey.get('inflation_expectations');
  const riskDefinition = byKey.get('israel_risk_proxy');
  const signals: Signal[] = [];
  if (rate) signals.push(asSignal(rate, rateStatus, { currentRate: latestRate?.value ?? null, changeOverAvailableHistory: rateDelta, changeThreshold: rateThreshold, lookbackObservations: rateLookback }, rateStatus === 'unknown' ? 'ממתין לתצפית נוספת של מקור הריבית.' : 'הריבית הקצרה אינה קובעת מכנית את תשואת האג״ח הארוכה.', latestRate?.observation_date ?? null, rateDelta));
  if (cpiDefinition) {
    const targetLow = setting(settings, 'inflation_target_low', 1);
    const targetHigh = setting(settings, 'inflation_target_high', 3);
    const materialRise = setting(settings, 'inflation_material_rise', 0.3);
    let status = inflationSignal(cpi.yoy, cpi.previousYoy, targetLow, targetHigh, materialRise);
    if (sourceMap.get('cbs_cpi')?.status !== 'ok') status = 'unknown';
    signals.push(asSignal(cpiDefinition, status, { index: cpi.latestIndex, momPercent: cpi.mom, yoyPercent: cpi.yoy, previousYoyPercent: cpi.previousYoy, targetLow, targetHigh, materialRise }, status === 'unknown' ? 'נדרשת היסטוריית מדד של 12 חודשים לפחות לחישוב שינוי שנתי.' : 'השינוי השנתי מחושב מרמת המדד של הלמ״ס; היעד מוצג בטווח הרשמי.', cpi.observationDate, cpi.yoy));
  }
  if (expectationDefinition) {
    if (sourceMap.get('boi_inflation_expectations')?.status !== 'ok') expectationsStatus = 'unknown';
    const latestDate = currentExpectations.il_bei_1y?.observation_date ?? null;
    signals.push(asSignal(expectationDefinition, expectationsStatus, {
      ilBei1y: currentExpectations.il_bei_1y?.value ?? null,
      ilBei5y: currentExpectations.il_bei_5y?.value ?? null,
      ilBei5y5y: currentExpectations.il_bei_5y5y?.value ?? null,
      forecasterCpi12m: currentExpectations.il_forecast_cpi_12m?.value ?? null,
      previousIlBei1y: previousOneYearExpectation?.value ?? null,
      changeIlBei1y: expected1y !== null && previousOneYearExpectation ? expected1y - previousOneYearExpectation.value : null,
      publicationDate: currentExpectations.il_bei_1y?.source_timestamp ?? null,
      targetLow, targetHigh,
    }, expectationDefinition.description_he, latestDate, expected1y));
  }
  const usdLookback = lookbackPercentChange(usdRows.map((row) => ({ date: row.observation_date, value: row.value })), 20);
  const latestUsd = usdRows.at(-1) ?? null;
  const latestUsReal = usRealRows.at(-1) ?? null;
  const alignedReal = realRows.map((row) => ({ israel: row, us: [...usRealRows].reverse().find((us) => us.observation_date <= row.date) })).filter((pair) => pair.us !== undefined);
  const currentAligned = alignedReal.at(-1) ?? null;
  const comparisonForDiff = currentAligned ? new Date(`${currentAligned.israel.date}T00:00:00Z`) : null;
  if (comparisonForDiff) comparisonForDiff.setUTCDate(comparisonForDiff.getUTCDate() - setting(settings, 'yield_comparison_days', 30));
  const previousAligned = comparisonForDiff ? [...alignedReal].reverse().find((pair) => pair.israel.date <= comparisonForDiff.toISOString().slice(0, 10)) ?? null : null;
  const currentDifferentialBps = currentAligned ? (currentAligned.israel.value - currentAligned.us!.value) * 100 : null;
  const previousDifferentialBps = previousAligned ? (previousAligned.israel.value - previousAligned.us!.value) * 100 : null;
  const differentialChangeBps = currentDifferentialBps !== null && previousDifferentialBps !== null ? currentDifferentialBps - previousDifferentialBps : null;
  const usdUsable = sourceMap.get('boi_usdils')?.status === 'ok';
  const realUsable = sourceMap.get('boi_real_curve')?.status === 'ok';
  const usRealUsable = sourceMap.get('us_treasury_real')?.status === 'ok';
  const risk = riskConditionsProxy({
    usdIls20dPercent: usdUsable ? usdLookback : null,
    israelRealYieldChangeBps: realUsable ? realChangeBps : null,
    realYieldDifferentialChangeBps: realUsable && usRealUsable ? differentialChangeBps : null,
    usdIlsObservationDate: latestUsd?.observation_date ?? null,
    israelRealObservationDate: latestReal?.date ?? null,
    differentialObservationDate: currentAligned?.israel.date ?? null,
  }, {
    usdIlsPercent: setting(settings, 'risk_usdils_change_threshold_pct', 2),
    realYieldBps: setting(settings, 'risk_real_yield_change_threshold_bps', 15),
    differentialBps: setting(settings, 'risk_real_differential_change_threshold_bps', 15),
  });
  if (riskDefinition) signals.push(asSignal(riskDefinition, risk.status, {
    score: risk.value,
    usdIls20dPercent: usdUsable ? usdLookback : null,
    israelRealYieldChangeBps: realUsable ? realChangeBps : null,
    realYieldDifferentialChangeBps: realUsable && usRealUsable ? differentialChangeBps : null,
    availableComponents: risk.components.filter((item) => item.normalizedScore !== null).length,
    components: JSON.stringify(risk.components),
  }, risk.explanationHe, risk.components.map((component) => component.sourceObservationDate).filter((date): date is string => Boolean(date)).sort().at(-1) ?? null, risk.value));
  if (realDefinition) {
    let status: SignalStatus = realChangeBps === null ? 'unknown' : realChangeBps < -yieldThreshold ? 'green' : realChangeBps > yieldThreshold ? 'red' : 'yellow';
    if (sourceMap.get('boi_real_curve')?.status !== 'ok') status = 'unknown';
    signals.push(asSignal(realDefinition, status, { current10y: latestReal?.value ?? null, changeOverSourceMonthBps: realChangeBps, comparisonDate: priorMonthYield?.date ?? null, thresholdBps: yieldThreshold }, realChangeBps === null ? 'נדרשות לפחות שתי תצפיות בעקום.' : 'ההשוואה מבוססת על ממוצעי העקום של בנק ישראל; זו אינה תשואה תוך-יומית.', latestReal?.date ?? null, realChangeBps));
  }
  if (trendDefinition) {
    let status: SignalStatus = nominalChangeBps === null ? 'unknown' : nominalChangeBps < -yieldThreshold ? 'green' : nominalChangeBps > yieldThreshold ? 'red' : 'yellow';
    if (sourceMap.get('boi_nominal_curve')?.status !== 'ok') status = 'unknown';
    signals.push(asSignal(trendDefinition, status, { current10yNominal: latestNominal?.value ?? null, changeOverSourceMonthBps: nominalChangeBps, comparisonDate: priorNominal?.date ?? null, thresholdBps: yieldThreshold, availableSourceObservations: nominalRows.length }, nominalChangeBps === null ? 'ממתין לשתי תצפיות מקור בעקום הנומינלי.' : 'קובצי העקום הנומינלי של בנק ישראל הם ממוצעים תקופתיים; אין כאן השלמה לתצפיות יומיות.', latestNominal?.date ?? null, nominalChangeBps));
  }
  const pushContextSignal = (key: string, status: SignalStatus, value: Signal['value'], observationDate: string | null, score: number | null = null, explanationHe?: string) => {
    const definition = byKey.get(key);
    if (definition) signals.push(asSignal(definition, status, value, explanationHe ?? definition.description_he, observationDate, score));
  };
  const currentUsdValue = latestUsd?.value ?? null;
  const usdStatus: SignalStatus = sourceMap.get('boi_usdils')?.status === 'ok' ? 'yellow' : 'unknown';
  pushContextSignal('usd_ils', usdStatus, { current: currentUsdValue, change1dPct: percentChange(currentUsdValue ?? NaN, usdRows.at(-2)?.value ?? NaN), change5dPct: lookbackPercentChange(usdRows.map((row) => ({ date: row.observation_date, value: row.value })), 5), change20dPct: usdLookback, change60dPct: lookbackPercentChange(usdRows.map((row) => ({ date: row.observation_date, value: row.value })), 60), fixingIsIndicative: 1 }, latestUsd?.observation_date ?? null);
  const latestUsNominal = usNominalRows.at(-1) ?? null;
  const addUsContext = (key: 'us_10y_nominal' | 'us_10y_real', rows: DbObservation[], latest: DbObservation | null) => {
    const sourceKey = key === 'us_10y_nominal' ? 'us_treasury_nominal' : 'us_treasury_real';
    const status: SignalStatus = sourceMap.get(sourceKey)?.status === 'ok' ? 'yellow' : 'unknown';
    const changes = [1, 5, 20, 60].map((sessions) => [sessions, lookbackChange(rows.map((row) => ({ date: row.observation_date, value: row.value })), sessions)] as const);
    const explanation = key === 'us_10y_nominal' ? 'תשואה נומינלית יומית ממקור U.S. Treasury הרשמי; נתון הקשר בלבד.' : 'תשואה ריאלית יומית ממקור U.S. Treasury הרשמי; נתון הקשר בלבד.';
    pushContextSignal(key, status, { current: latest?.value ?? null, change1dBps: changes[0][1] === null ? null : changes[0][1] * 100, change5dBps: changes[1][1] === null ? null : changes[1][1] * 100, change20dBps: changes[2][1] === null ? null : changes[2][1] * 100, change60dBps: changes[3][1] === null ? null : changes[3][1] * 100 }, latest?.observation_date ?? null, null, explanation);
  };
  addUsContext('us_10y_nominal', usNominalRows, latestUsNominal);
  addUsContext('us_10y_real', usRealRows, latestUsReal);
  pushContextSignal('il_us_real_yield_differential', currentDifferentialBps === null || !realUsable || !usRealUsable ? 'unknown' : 'yellow', { currentBps: currentDifferentialBps, previousBps: previousDifferentialBps, changeBps: differentialChangeBps, israelObservationDate: currentAligned?.israel.date ?? null, usObservationDate: currentAligned?.us?.observation_date ?? null, previousIsraelObservationDate: previousAligned?.israel.date ?? null, previousUsObservationDate: previousAligned?.us?.observation_date ?? null }, currentAligned?.israel.date ?? null, differentialChangeBps);
  return signals;
}

async function persistSignalSnapshots(db: D1Database, signals: Signal[]): Promise<void> {
  const date = todayUtc();
  const createdAt = nowIso();
  const statements: D1PreparedStatement[] = [];
  for (const signal of signals) {
    const valueJson = JSON.stringify(signal.value);
    const rawHash = await sha256Text(JSON.stringify({ status: signal.status, score: signal.score, value: signal.value, explanation: signal.explanationHe }));
    const revision = buildRevisionInsert('signal_snapshots', { signal_key: signal.key, observation_date: date, status: signal.status, score: signal.score, value_json: valueJson, explanation_he: signal.explanationHe, raw_payload_hash: rawHash, created_at: createdAt }, [signal.key, date], rawHash);
    statements.push(db.prepare(revision.sql).bind(...revision.values));
  }
  if (statements.length) await db.batch(statements);
}

async function getSourceStatuses(db: D1Database): Promise<SourceStatus[]> {
  const statuses: Array<{ key: string; name: string; url: string; seriesId: string; curveType?: 'nominal' | 'real' }> = [
    { key: 'boi_policy_rate', name: 'ריבית בנק ישראל', url: BOI_RATE_PAGE, seriesId: 'boi_policy_rate' },
    { key: 'cbs_cpi', name: 'מדד המחירים לצרכן', url: CBS_CPI_PAGE, seriesId: 'cpi_index' },
    { key: 'boi_nominal_curve', name: 'עקום נומינלי — בנק ישראל', url: BOI_CURVE_PAGE, seriesId: 'nominal_yield_10y', curveType: 'nominal' },
    { key: 'boi_real_curve', name: 'עקום ריאלי — בנק ישראל', url: BOI_CURVE_PAGE, seriesId: 'real_yield_10y', curveType: 'real' },
    { key: 'boi_inflation_expectations', name: 'ציפיות אינפלציה — בנק ישראל', url: BOI_EXPECTATIONS_PAGE, seriesId: 'il_bei_1y' },
    { key: 'boi_usdils', name: 'שער דולר / שקל יציג — בנק ישראל', url: BOI_USD_RATE_URL, seriesId: 'usd_ils' },
    { key: 'us_treasury_nominal', name: 'U.S. Treasury', url: US_TREASURY_PAGE, seriesId: 'ust_10y_nominal' },
    { key: 'us_treasury_real', name: 'U.S. Treasury', url: US_TREASURY_PAGE, seriesId: 'ust_10y_real' },
  ];
  const output: SourceStatus[] = [];
  for (const source of statuses) {
    const latest = await db.prepare('SELECT started_at, completed_at, status, error_message FROM ingestion_runs WHERE job_key = ? ORDER BY started_at DESC LIMIT 1').bind(source.key).first<RunRow>();
    const series = await db.prepare('SELECT stale_after_hours AS staleAfterHours FROM macro_series WHERE id = ?').bind(source.seriesId).first<{ staleAfterHours: number }>();
    const observation = await db.prepare('SELECT observation_date, value FROM latest_macro_observations WHERE series_id = ? ORDER BY observation_date DESC LIMIT 1').bind(source.seriesId).first<{ observation_date: string; value: number }>();
    const curve = source.curveType ? await db.prepare('SELECT observation_date, value FROM latest_yield_curve_observations WHERE curve_type = ? AND tenor_years = 10 ORDER BY observation_date DESC LIMIT 1').bind(source.curveType).first<{ observation_date: string; value: number }>() : null;
    const obs = curve ?? observation;
    const observationDate = obs?.observation_date ? new Date(`${obs.observation_date}T00:00:00Z`) : null;
    const stale = !observationDate || (Date.now() - observationDate.valueOf()) / 3_600_000 > (series?.staleAfterHours ?? 1080);
    const errorText = latest?.status === 'error' ? latest.error_message ?? '' : '';
    const failureKind = latest?.status !== 'error' ? null : /timeout|timed out|abort/i.test(errorText) ? 'timeout' : /malformed|invalid|empty|no valid|missing .*header|no worksheet/i.test(errorText) ? 'malformed' : 'unavailable';
    output.push({ key: source.key, name: source.name, url: source.url, status: latest?.status === 'error' ? 'error' : !latest ? 'pending' : stale ? 'stale' : 'ok', lastSuccessAt: latest?.status === 'success' ? latest.completed_at : null, lastErrorAt: latest?.status === 'error' ? latest.completed_at : null, lastError: null, failureKind, checkedAt: latest?.completed_at ?? latest?.started_at ?? null, observationDate: obs?.observation_date ?? null, observationValue: obs?.value ?? null });
  }
  return output;
}

async function persistRegimeSnapshot(db: D1Database, overview: OverviewResponse): Promise<void> {
  
  const date=todayUtc(), created=nowIso(), version='1';
  const primary=overview.signals.filter(x=>x.weight>0);
  const available=primary.filter(x=>x.status!=='unknown').reduce((a,x)=>a+x.weight,0);
  const hash=await sha256Text(JSON.stringify(primary.map(x=>[x.key,x.status,x.score,x.observationDate,x.value])));
  await db.prepare('INSERT OR IGNORE INTO regime_snapshots (snapshot_date,score,status,coverage_pct,green_count,yellow_count,red_count,calculation_version,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(date,overview.regime.score,overview.regime.status,overview.regime.coveragePct,overview.regime.green,overview.regime.yellow,overview.regime.red,version,created).run();
  const statements=primary.map(x=>db.prepare('INSERT OR IGNORE INTO regime_snapshot_components (snapshot_date,signal_key,value,status,normalized_score,effective_weight,source_observation_date) VALUES (?,?,?,?,?,?,?)').bind(date,x.key,x.score,x.status,x.status==='green'?1:x.status==='red'?-1:x.status==='yellow'?0:null,available&&x.status!=='unknown'?x.weight/available:0,x.observationDate));
  if(statements.length) await db.batch(statements);
  const diff=overview.markets.realYieldDifferential;
  if(diff.value!==null&&diff.observationDate) await db.prepare('INSERT OR IGNORE INTO derived_observations (series_key,observation_date,value,unit,calculation_version,inputs_hash,created_at) VALUES (?,?,?,?,?,?,?)').bind(diff.key,diff.observationDate,diff.value,diff.unit,version,hash,created).run();
}

async function getRegimeHistory(db: D1Database) {
 const q=await db.prepare('SELECT snapshot_date,score,coverage_pct,status,green_count,yellow_count,red_count FROM regime_snapshots ORDER BY snapshot_date DESC LIMIT 180').all<DbRegimeHistory>();
 const out=[]; for(const r of q.results){const c=await db.prepare('SELECT d.name_he,c.normalized_score FROM regime_snapshot_components c JOIN signal_definitions d ON d.key=c.signal_key WHERE c.snapshot_date=? AND c.normalized_score IS NOT NULL ORDER BY c.normalized_score DESC,c.effective_weight DESC').bind(r.snapshot_date).all<{name_he:string;normalized_score:number}>();out.push({date:r.snapshot_date,score:r.score,coveragePct:r.coverage_pct,status:r.status,green:r.green_count,yellow:r.yellow_count,red:r.red_count,topPositive:c.results.find(x=>x.normalized_score>0)?.name_he??null,topNegative:[...c.results].reverse().find(x=>x.normalized_score<0)?.name_he??null});} return out;
}

interface BondDbRow { id:string; issuer_key:string; issuer_name_he:string; issuer_name_en:string; issuer_group:string; series_name:string; security_id:string|null; linkage_type:LinkageType|null; coupon_rate:number|null; maturity_date:string|null; next_principal_date:string|null; final_principal_date:string|null; outstanding_amount:number|null; rating:string|null; rating_agency:string|null; rating_date:string|null; collateral_summary:string|null; clean_price:number|null; dirty_price:number|null; ytm:number|null; real_ytm:number|null; nominal_ytm:number|null; duration:number|null; modified_duration:number|null; trading_volume:number|null; last_trade_at:string|null; observation_date:string|null; observed_at:string|null; source_url:string|null; benchmark_yield:number|null; benchmark_duration:number|null; matching_method:string|null; spread_bp:number|null; spread_per_duration:number|null; }
function latestDatedCurve(points:YieldPoint[],date:string|null):Array<{tenorYears:number;yieldPercent:number}>{const eligible=points.filter(p=>date&&p.date<=date);const latest=eligible.at(-1)?.date;return latest?eligible.filter(p=>p.date===latest).map(p=>({tenorYears:p.tenorYears,yieldPercent:p.value})):[];}
async function getBondUniverse(db:D1Database,filters:BondFilters={}):Promise<{issuers:Array<{issuerKey:string;issuerNameHe:string;issuerNameEn:string;issuerGroup:string}>;rows:BondMarketRecord[]}> {
 const issuerRows=await db.prepare('SELECT issuer_key,issuer_name_he,issuer_name_en,issuer_group FROM bond_issuers ORDER BY issuer_key').all<{issuer_key:string;issuer_name_he:string;issuer_name_en:string;issuer_group:string}>();
 const [realPoints,nominalPoints,dbSettings]=await Promise.all([getCurve(db,'real'),getCurve(db,'nominal'),getDashboardSettings(db)]);const quoteStaleDays=setting(dbSettings,'bond_quote_stale_business_days',3);
 const q=await db.prepare(`SELECT b.id,b.issuer_key,i.issuer_name_he,i.issuer_name_en,i.issuer_group,b.series_name,b.security_id,b.linkage_type,b.coupon_rate,b.maturity_date,b.next_principal_date,b.final_principal_date,b.outstanding_amount,b.rating,b.rating_agency,b.rating_date,b.collateral_summary,o.clean_price,o.dirty_price,COALESCE(o.ytm,o.real_ytm,o.nominal_ytm) ytm,o.real_ytm,o.nominal_ytm,o.duration,o.modified_duration,o.trading_volume,o.last_trade_at,o.observation_date,o.observed_at,o.source_url,k.benchmark_yield,k.benchmark_duration,k.matching_method,k.spread_bp,k.spread_per_duration FROM bond_master b JOIN bond_issuers i ON i.issuer_key=b.issuer_key LEFT JOIN latest_bond_market_observations o ON o.bond_id=b.id LEFT JOIN bond_benchmark_observations k ON k.bond_id=b.id AND k.observation_date=o.observation_date AND k.calculation_version=(SELECT MAX(k2.calculation_version) FROM bond_benchmark_observations k2 WHERE k2.bond_id=b.id AND k2.observation_date=o.observation_date) WHERE b.is_active IS NULL OR b.is_active=1 ORDER BY b.issuer_key,b.series_name LIMIT 500`).all<BondDbRow>();
 const rows=await Promise.all(q.results.map(async r=>{const spreadHistory=await db.prepare('SELECT spread_bp FROM bond_benchmark_observations WHERE bond_id=? AND calculation_version=(SELECT MAX(x.calculation_version) FROM bond_benchmark_observations x WHERE x.bond_id=bond_benchmark_observations.bond_id AND x.observation_date=bond_benchmark_observations.observation_date) ORDER BY observation_date DESC LIMIT 61').bind(r.id).all<{spread_bp:number|null}>();const historical=spreadHistory.results.map(x=>x.spread_bp).filter((x):x is number=>x!==null);const change=(n:number)=>historical.length>n?historical[0]-historical[n]:null;const age=quoteAgeBusinessDays(r.last_trade_at?.slice(0,10)??r.observation_date);const curve=r.linkage_type==='cpi'?realPoints:nominalPoints;const eligible=curve.filter(point=>r.observation_date&&point.date<=r.observation_date);const curveDate=eligible.at(-1)?.date??null;const maturityYears=r.maturity_date&&r.observation_date?(new Date(r.maturity_date).valueOf()-new Date(r.observation_date).valueOf())/(365.25*86400000):null;const curvesForBond={cpi:latestDatedCurve(realPoints,r.observation_date),nominal:latestDatedCurve(nominalPoints,r.observation_date)};const match=matchGovernmentBenchmark(r.linkage_type??'nominal',r.modified_duration??r.duration,maturityYears,curvesForBond);const benchmarkYield=r.benchmark_yield??match.yieldPercent;const spread=r.spread_bp??creditSpreadBp(r.ytm??r.real_ytm??r.nominal_ytm,benchmarkYield);const mismatch=Boolean(r.observation_date&&curveDate&&Math.abs(new Date(r.observation_date).valueOf()-new Date(curveDate).valueOf())>3*86400000);return {id:r.id,issuerKey:r.issuer_key,issuerNameHe:r.issuer_name_he,seriesName:r.series_name,securityId:r.security_id,linkageType:r.linkage_type??'nominal',couponRate:r.coupon_rate,maturityDate:r.maturity_date,nextPrincipalDate:r.next_principal_date,finalPrincipalDate:r.final_principal_date,cleanPrice:r.clean_price,dirtyPrice:r.dirty_price,ytm:r.ytm,realYtm:r.real_ytm,nominalYtm:r.nominal_ytm,duration:r.modified_duration??r.duration,modifiedDuration:r.modified_duration,outstandingAmount:r.outstanding_amount,rating:r.rating,ratingAgency:r.rating_agency,ratingDate:r.rating_date,collateralSummary:r.collateral_summary,tradingVolume:r.trading_volume,lastTradeAt:r.last_trade_at,observationDate:r.observation_date,observedAt:r.observed_at,sourceUrl:r.source_url,benchmarkYield,benchmarkTenor:r.benchmark_duration??match.tenorYears,benchmarkQuality:(r.matching_method??match.quality) as BondMarketRecord['benchmarkQuality'],spreadBp:spread,spreadPerDuration:r.spread_per_duration??spreadPerDuration(spread,r.modified_duration??r.duration),spreadChange1dBp:change(1),spreadChange5dBp:change(5),spreadChange20dBp:change(20),spreadChange60dBp:change(60),quoteAgeBusinessDays:age,stale:age===null||age>quoteStaleDays,timestampMismatch:mismatch};}));
 return {issuers:issuerRows.results.map(i=>({issuerKey:i.issuer_key,issuerNameHe:i.issuer_name_he,issuerNameEn:i.issuer_name_en,issuerGroup:i.issuer_group})),rows:applyBondFilters(rows,filters)};
}

async function refreshBondBenchmarks(db:D1Database):Promise<void> {
 const [real,nominal,bonds]=await Promise.all([getCurve(db,'real'),getCurve(db,'nominal'),db.prepare(`SELECT b.id,b.linkage_type,b.maturity_date,o.observation_date,COALESCE(o.modified_duration,o.duration) duration,COALESCE(o.ytm,o.real_ytm,o.nominal_ytm) ytm FROM bond_master b JOIN latest_bond_market_observations o ON o.bond_id=b.id WHERE b.is_active IS NULL OR b.is_active=1`).all<{id:string;linkage_type:LinkageType|null;maturity_date:string|null;observation_date:string;duration:number|null;ytm:number|null}>()]);
 const writes:D1PreparedStatement[]=[];
 for(const bond of bonds.results){const linkage=bond.linkage_type??'nominal';const date=new Date(bond.observation_date);const maturityYears=bond.maturity_date?(new Date(bond.maturity_date).valueOf()-date.valueOf())/(365.25*86400000):null;const matching=matchGovernmentBenchmark(linkage,bond.duration,maturityYears,{cpi:latestDatedCurve(real,bond.observation_date),nominal:latestDatedCurve(nominal,bond.observation_date)});const spread=creditSpreadBp(bond.ytm,matching.yieldPercent);writes.push(db.prepare('INSERT OR IGNORE INTO bond_benchmark_observations (bond_id,observation_date,benchmark_curve,benchmark_duration,benchmark_yield,matching_method,spread_bp,spread_per_duration,calculation_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(bond.id,bond.observation_date,linkage==='cpi'?'real':'nominal',bond.duration??maturityYears,matching.yieldPercent,matching.quality,spread,spreadPerDuration(spread,bond.duration),'1',nowIso()));}
 for(let i=0;i<writes.length;i+=100) await db.batch(writes.slice(i,i+100));
}

async function getOverview(db: D1Database): Promise<OverviewResponse> {
  const [rateRows, cpiRows, realCurve, nominalCurve, sources, definitions, settings] = await Promise.all([
    getHistory(db, 'boi_policy_rate', 180), getHistory(db, 'cpi_index', 240), getCurve(db, 'real'), getCurve(db, 'nominal'),
    getSourceStatuses(db), getSignalDefinitions(db), getDashboardSettings(db),
  ]);
  const cpi = cpiStats(cpiRows);
  const expIds = ['il_bei_1y', 'il_bei_5y', 'il_bei_5y5y', 'il_forecast_cpi_12m'];
  const [expectationRows, usdRows, us2yRows, usNominalRows, usRealRows] = await Promise.all([Promise.all(expIds.map((id) => getHistory(db, id, 240))), getHistory(db, 'usd_ils', 500), getHistory(db, 'ust_2y_nominal', 500), getHistory(db, 'ust_10y_nominal', 500), getHistory(db, 'ust_10y_real', 500)]);
  const expectations = Object.fromEntries(expIds.map((id, index) => [id, expectationRows[index]]));
  const currentSignals = await buildSignals(db, definitions, settings, cpiRows, realCurve, nominalCurve, expectations, usdRows, usNominalRows, usRealRows, sources);
  const regimeResult = weightedRegime(
    currentSignals.filter((signal) => signal.weight > 0).map((signal) => ({ status: signal.status, weight: definitions.find((definition) => definition.key === signal.key)?.weight ?? signal.weight })),
    setting(settings, 'regime_positive_threshold', 0.35),
    setting(settings, 'regime_negative_threshold', -0.35),
  );
  const signalByKey = new Map(currentSignals.map((signal) => [signal.key, signal]));
  const sourceByKey = new Map(sources.map((source) => [source.key, source]));
  const rate = rateRows.at(-1) ?? null;
  const oldRate = rateRows.length > 1 ? rateRows.at(-2)! : null;
  const rateRun = await db.prepare('SELECT details_json FROM ingestion_runs WHERE job_key = ? AND status = ? ORDER BY started_at DESC LIMIT 1').bind('boi_policy_rate', 'success').first<{ details_json: string }>();
  let nextDecisionDate: string | null = null;
  try { nextDecisionDate = rateRun ? (JSON.parse(rateRun.details_json) as { nextDecisionDate?: string | null }).nextDecisionDate ?? null : null; } catch { nextDecisionDate = null; }
  const real10 = realCurve.filter((row) => row.tenorYears === 10);
  const latestReal = real10.at(-1) ?? null;
  const realSignal = signalByKey.get('long_real_yield');
  const comparisonDate = typeof realSignal?.value.comparisonDate === 'string' ? realSignal.value.comparisonDate : null;
  const previousReal = comparisonDate ? real10.find((row) => row.date === comparisonDate) ?? null : null;
  const realChange = typeof realSignal?.score === 'number' ? realSignal.score : null;
  const trendSignal = signalByKey.get('long_yield_momentum');
  const card = (key: string, title: string, value: number | null, previousValue: number | null, change: number | null, unit: string, explanation: string, observedAt: string | null, source: SourceStatus | undefined, history: Observation[], pending = false, details: MacroCard['details'] = {}): MacroCard => ({ key, title, value, previousValue, change, unit, status: signalByKey.get(key)?.status ?? 'unknown', explanation, observedAt, source: key === 'cpi_inflation' && source ? 'הלשכה המרכזית לסטטיסטיקה (הלמ״ס)' : source?.name ?? 'לא זמין', sourceUrl: source?.url ?? '#', sourceUrls: key === 'israel_risk_proxy' ? [BOI_USD_RATE_URL, BOI_CURVE_PAGE, treasuryCsvUrl(new Date().getUTCFullYear(), 'daily_treasury_real_yield_curve')] : source?.url ? [source.url] : [], history, pending, details: { ...details, sourceFetchedAt: source?.lastSuccessAt ?? null } });
  const riskProxySource = sourceByKey.get('boi_usdils') ? { ...sourceByKey.get('boi_usdils')!, name: 'בנק ישראל + U.S. Treasury', url: BOI_CURVE_PAGE } : undefined;
  const cards: MacroCard[] = [
    card('policy_rate', 'ריבית בנק ישראל', rate?.value ?? null, oldRate?.value ?? null, rate && oldRate ? (rate.value - oldRate.value) * 100 : null, '%', 'משפיעה על הריבית הקצרה; אינה קובעת מכנית את תשואות האג״ח הארוכות.', rate?.observation_date ?? null, sourceByKey.get('boi_policy_rate'), rateRows.map(toObservation), false, { nextDecisionDate }),
    card('cpi_inflation', 'אינפלציה', cpi.yoy, cpi.previousYoy, cpi.mom, '% שנתי', cpi.yoy === null ? 'נדרשת היסטוריית מדד של 12 חודשים לפחות.' : `מדד חודשי ${cpi.mom === null ? '—' : `${round(cpi.mom, 2)}%`}; יעד בנק ישראל ${setting(settings, 'inflation_target_low', 1)}–${setting(settings, 'inflation_target_high', 3)}%.`, cpi.observationDate, sourceByKey.get('cbs_cpi'), cpiRows.map(toObservation), false, { index: cpi.latestIndex, yoy: cpi.yoy, previousYoy: cpi.previousYoy, targetLow: setting(settings, 'inflation_target_low', 1), targetHigh: setting(settings, 'inflation_target_high', 3) }),
    card('inflation_expectations', 'ציפיות אינפלציה', expectationRows[0].at(-1)?.value ?? null, expectationRows[0].at(-2)?.value ?? null, expectationRows[0].length>1 ? expectationRows[0].at(-1)!.value-expectationRows[0].at(-2)!.value : null, '%', 'נתוני הציפיות מתפרסמים מעת לעת; תאריך הפרסום והמקור מוצגים לצד הנתון.', expectationRows[0].at(-1)?.observation_date ?? null, sourceByKey.get('boi_inflation_expectations'), expectationRows[0].map(toObservation)),
    card('israel_risk_proxy', 'פרוקסי תנאי הסיכון בישראל', signalByKey.get('israel_risk_proxy')?.score ?? null, null, signalByKey.get('israel_risk_proxy')?.score ?? null, 'מדד', 'פרוקסי שקוף המשלב דולר/שקל, תשואה ריאלית בישראל ופער תשואות ריאליות בין ישראל לארה״ב; אינו CDS סחיר.', signalByKey.get('israel_risk_proxy')?.observationDate ?? null, riskProxySource, usdRows.map(toObservation), false, signalByKey.get('israel_risk_proxy')?.value ?? {}),
    card('long_real_yield', 'תשואה ריאלית ל-10 שנים', latestReal?.value ?? null, previousReal?.value ?? null, realChange, '%', 'נתון עקום רשמי; שינוי חודשי מחושב מול תצפית המקור הזמינה. מגמת התשואה אינה המלצת השקעה.', latestReal?.date ?? null, sourceByKey.get('boi_real_curve'), real10.map((row) => ({ observationDate: row.date, value: row.value, ingestedAt: row.ingestedAt ?? '', sourceTimestamp: row.sourceTimestamp ?? null, revisionNumber: row.revisionNumber })), false, { tenorYears: 10, changeBps: realChange }),
    card('long_yield_momentum', 'מגמת תשואות ארוכות', trendSignal?.score ?? null, null, trendSignal?.score ?? null, 'נ״ב / חודש מקור', 'המקור הרשמי הוא ממוצע חצי-חודשי. אין דיוק יומי לחישוב 5/20/60 ימי מסחר; כאן מוצגת השוואה לתצפית חודשית קודמת בלבד.', latestReal?.date ?? null, sourceByKey.get('boi_real_curve'), real10.map((row) => ({ observationDate: row.date, value: row.value, ingestedAt: row.ingestedAt ?? '', sourceTimestamp: row.sourceTimestamp ?? null, revisionNumber: row.revisionNumber })), false, trendSignal?.value ?? {}),
  ];
  const regime = { status: regimeResult.status, coveragePct: regimeResult.coveragePct, score: regimeResult.score === null ? null : round(regimeResult.score, 3), green: regimeResult.counts.green, yellow: regimeResult.counts.yellow, red: regimeResult.counts.red, unknown: regimeResult.counts.unknown, confidence: regimeResult.confidence, reasons: currentSignals.filter((signal) => signal.status !== 'unknown').map((signal) => `${signal.nameHe}: ${signal.explanationHe}`) };
  const market = (key: string, rows: DbObservation[], unit: string, sourceKey: string, changes: Record<string, number | null>): MarketSeries => { const src = sourceByKey.get(sourceKey); const last = rows.at(-1); return { key, value: last?.value ?? null, unit, observationDate: last?.observation_date ?? null, sourceTimestamp: last?.source_timestamp ?? null, source: src?.name ?? 'לא זמין', sourceUrl: src?.url ?? '#', status: src?.status ?? 'pending', changes, history: rows.map(toObservation), ingestedAt:last?.ingested_at ?? null, revisionNumber:last?.revision_number ?? null }; };
  const usdPoints = usdRows.map((r) => ({ date: r.observation_date, value: r.value }));
  const usd = market('usd_ils', usdRows, 'ILS', 'boi_usdils', { '1dPct': lookbackPercentChange(usdPoints,1), '5dPct': lookbackPercentChange(usdPoints,5), '20dPct': lookbackPercentChange(usdPoints,20), '60dPct': lookbackPercentChange(usdPoints,60) });
  const toYieldPoints = (rows: DbObservation[]) => rows.map((row) => ({ date: row.observation_date, value: row.value }));
  const us2y = { ...market('us_2y_nominal', us2yRows, '%', 'us_treasury_nominal', usTreasuryChangesBps(toYieldPoints(us2yRows))), derived: false, provenance: 'U.S. Treasury Daily Treasury Par Yield Curve Rates' };
  const usNom = { ...market('us_10y_nominal', usNominalRows, '%', 'us_treasury_nominal', usTreasuryChangesBps(toYieldPoints(usNominalRows))), derived: false, provenance: 'U.S. Treasury Daily Treasury Par Yield Curve Rates' };
  const usReal = { ...market('us_10y_real', usRealRows, '%', 'us_treasury_real', usTreasuryChangesBps(toYieldPoints(usRealRows))), derived: false, provenance: 'U.S. Treasury Daily Treasury Par Real Yield Curve Rates' };
  const breakevenRows = deriveUs10yBreakeven(toYieldPoints(usNominalRows), toYieldPoints(usRealRows));
  const breakevenValues: DbObservation[] = breakevenRows.map((row) => ({ observation_date: row.date, value: row.value, ingested_at: usNominalRows.find((nominal) => nominal.observation_date === row.date)?.ingested_at ?? nowIso(), source_timestamp: null, revision_number: 1 }));
  const derivedBreakevenStatus: SourceStatus['status'] = usNom.status === 'error' || usReal.status === 'error' ? 'error' : usNom.status === 'stale' || usReal.status === 'stale' ? 'stale' : usNom.status === 'ok' && usReal.status === 'ok' ? 'ok' : 'pending';
  const usBreakeven = { ...market('us_10y_breakeven', breakevenValues, '%', 'us_treasury_nominal', usTreasuryChangesBps(breakevenRows)), status: derivedBreakevenStatus, derived: true, provenance: 'תשואה נומינלית ל־10 שנים פחות תשואה ריאלית ל־10 שנים, בתאריכים חופפים' };
  const curveRows = deriveUs2s10s(toYieldPoints(usNominalRows), toYieldPoints(us2yRows));
  const curveValues: DbObservation[] = curveRows.map((row) => ({ observation_date: row.date, value: row.value, ingested_at: usNominalRows.find((nominal) => nominal.observation_date === row.date)?.ingested_at ?? nowIso(), source_timestamp: null, revision_number: 1 }));
  const curveStatus: SourceStatus['status'] = us2y.status === 'error' || usNom.status === 'error' ? 'error' : us2y.status === 'stale' || usNom.status === 'stale' ? 'stale' : us2y.status === 'ok' && usNom.status === 'ok' ? 'ok' : 'pending';
  const us2s10s = { ...market('us_2s10s', curveValues, 'bp', 'us_treasury_nominal', usTreasuryChangesBps(curveRows, 1)), status: curveStatus, source: 'U.S. Treasury', sourceUrl: US_TREASURY_PAGE, derived: true, provenance: 'תשואה ל־10 שנים פחות תשואה ל־2 שנים, בתאריכים חופפים' };
  const differentialSignal = signalByKey.get('il_us_real_yield_differential');
  const diffCurrent = typeof differentialSignal?.value.currentBps === 'number' ? differentialSignal.value.currentBps : null;
  const boiRealStatus = sourceByKey.get('boi_real_curve')?.status ?? 'pending';
  const treasuryRealStatus = sourceByKey.get('us_treasury_real')?.status ?? 'pending';
  const differentialStatus: SourceStatus['status'] = boiRealStatus === 'error' || treasuryRealStatus === 'error' ? 'error' : boiRealStatus === 'stale' || treasuryRealStatus === 'stale' ? 'stale' : boiRealStatus === 'ok' && treasuryRealStatus === 'ok' && diffCurrent !== null ? 'ok' : 'pending';
  const differential = createRealYieldDifferential(diffCurrent, differentialSignal, nowIso(), differentialStatus);
  const riskSignal = signalByKey.get('israel_risk_proxy');
  let riskComponents = []; try { riskComponents = JSON.parse(String(riskSignal?.value.components ?? '[]')); } catch { riskComponents=[]; }
  const riskProxy = { value:riskSignal?.score ?? null, status:riskSignal?.status ?? 'unknown', label:'פרוקסי תנאי הסיכון בישראל' as const, source:'בנק ישראל + U.S. Treasury', sourceUrls:[BOI_USD_RATE_URL, BOI_CURVE_PAGE, treasuryCsvUrl(new Date().getUTCFullYear(), 'daily_treasury_real_yield_curve')], provenance:'פרוקסי שקוף המשלב שער דולר/שקל, שינוי בתשואה ריאלית בישראל ושינוי בפער תשואות ריאליות בין ישראל לארה״ב; אינו CDS.', components:riskComponents, coverage:Number(riskSignal?.value.availableComponents ?? 0)/3, explanationHe:riskSignal?.explanationHe ?? 'אין די נתונים מאומתים לחישוב מדד תנאי הסיכון.' };
  const expectationsItems = expIds.map((id,index)=>market(id, expectationRows[index], '%', 'boi_inflation_expectations', { previousChange: expectationRows[index].length>1 ? expectationRows[index].at(-1)!.value-expectationRows[index].at(-2)!.value:null }));
  const regimeHistory=await getRegimeHistory(db);
  const bondUniverse=await getBondUniverse(db);
  const bondSource=bondSourceStatus();
  const expChange=expectationsItems[0]?.changes.previousChange;
  const changes=buildChangeSummary({israelRealYieldChangeBps:realChange,usdIls20dPercent:typeof usd.changes['20dPct']==='number'?usd.changes['20dPct']!:null,inflationExpectationChange:typeof expChange==='number'?expChange:null,usNominal5dBps:typeof usNom.changes['5dBp']==='number'?usNom.changes['5dBp']!:null,bondSpreadChanges:bondUniverse.rows.map(row=>({issuerHe:row.issuerNameHe,seriesName:row.seriesName,changeBp:row.spreadChange5dBp,thresholdBp:setting(settings,'bond_spread_change_threshold_bp',5)}))});
  return { generatedAt: nowIso(), regime, cards, signals: currentSignals, inflation: { ...cpi, targetLow: setting(settings, 'inflation_target_low', 1), targetHigh: setting(settings, 'inflation_target_high', 3), observations: cpiRows.map(toObservation) }, curves: { real: realCurve, nominal: nominalCurve }, sources, expectations:{items:expectationsItems,publicationDate:expectationsItems[0]?.sourceTimestamp ?? null}, markets:{usdIls:usd,us2yNominal:us2y,us10yNominal:usNom,us10yReal:usReal,us10yBreakeven:usBreakeven,us2s10s,realYieldDifferential:differential,riskProxy}, changes, regimeHistory, bondScreener:{sourceStatus:bondSource.status,sourceUrl:bondSource.sourceUrl,blocker:bondSource.blocker,issuers:bondUniverse.issuers,rows:bondUniverse.rows} };
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/credit/spreads') {
    const [series, sourceStatus] = await Promise.all([getCreditSeries(env.DB), creditSourceStatus(env.DB)]);
    return json({ series, sourceStatus, source: BOI_SECDWH_PAGE_URL, dataflow: 'BOI.STATISTICS:SECDWH:1.0' });
  }
  if (request.method === 'GET' && url.pathname === '/api/credit/summary') return json(await getCreditSummary(env.DB));
  const creditSeriesMatch = request.method === 'GET' ? url.pathname.match(/^\/api\/credit\/spreads\/([A-Za-z0-9_-]+)$/) : null;
  if (creditSeriesMatch) {
    const row = await env.DB.prepare('SELECT * FROM credit_spread_series WHERE series_code=?').bind(creditSeriesMatch[1]).first<CreditSeriesDb>();
    if (!row) return json({ error: 'Unknown BOI spread series code' }, 404);
    const series = await creditSeriesPayload(env.DB, row);
    return json({ ...series, sourceStatus: await creditSourceStatus(env.DB), changes: { change1m: series.change1m, change3m: series.change3m, change12m: series.change12m } });
  }
  if (request.method === 'GET' && url.pathname === '/api/health') {
    try {
      await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
      return json({ ok: true, service: 'bond-analyzer-api', timestamp: nowIso(), database: 'reachable' });
    } catch {
      return json({ ok: false, service: 'bond-analyzer-api', timestamp: nowIso(), database: 'unavailable' }, 503);
    }
  }
  if (request.method === 'GET' && (url.pathname === '/api/bonds' || url.pathname === '/api/bonds/relative-value' || url.pathname === '/api/bonds/spreads')) {
    const linkage=url.searchParams.get('linkage'); const page=Math.max(1,Math.min(1000,Number(url.searchParams.get('page')??1)||1)); const pageSize=Math.max(1,Math.min(100,Number(url.searchParams.get('page_size')??50)||50));
    const filters:BondFilters={issuer:url.searchParams.get('issuer')??undefined,linkage:linkage==='cpi'||linkage==='nominal'?linkage:undefined,minDuration:url.searchParams.has('min_duration')?Number(url.searchParams.get('min_duration')):undefined,maxDuration:url.searchParams.has('max_duration')?Number(url.searchParams.get('max_duration')):undefined,minMaturity:url.searchParams.get('min_maturity')??undefined,maxMaturity:url.searchParams.get('max_maturity')??undefined,rating:url.searchParams.get('rating')??undefined,minVolume:url.searchParams.has('min_volume')?Number(url.searchParams.get('min_volume')):undefined,hideStale:url.searchParams.get('stale')==='hide'};
    const data=await getBondUniverse(env.DB,filters); return json({source:bondSourceStatus(),issuers:data.issuers,total:data.rows.length,page,pageSize,bonds:data.rows.slice((page-1)*pageSize,page*pageSize)});
  }
  if (request.method === 'GET' && url.pathname === '/api/bonds/source-status') return json(bondSourceStatus());
  if (request.method === 'GET' && url.pathname === '/api/bonds/curve') { const linkage=url.searchParams.get('linkage'); if(linkage!=='cpi'&&linkage!=='nominal')return json({error:'linkage must be cpi or nominal'},400);const type=linkage==='cpi'?'real':'nominal';return json({linkage,curve:await getCurve(env.DB,type),source:BOI_CURVE_PAGE,sourceFrequency:'official periodic government curve'}); }
  const bondHistory=request.method==='GET'?url.pathname.match(/^\/api\/bonds\/([^/]+)\/history$/):null;
  if(bondHistory){const rows=await env.DB.prepare('SELECT observation_date AS observationDate,observed_at AS observedAt,clean_price AS cleanPrice,dirty_price AS dirtyPrice,ytm,real_ytm AS realYtm,nominal_ytm AS nominalYtm,duration,modified_duration AS modifiedDuration,trading_volume AS tradingVolume,last_trade_at AS lastTradeAt,source_url AS sourceUrl,revision,ingested_at AS ingestedAt FROM latest_bond_market_observations WHERE bond_id=? ORDER BY observation_date DESC LIMIT 1000').bind(bondHistory[1]).all();return json({bondId:bondHistory[1],observations:rows.results,sourceStatus:bondSourceStatus()});}
  const bondBenchmark=request.method==='GET'?url.pathname.match(/^\/api\/bonds\/([^/]+)\/benchmark$/):null;
  if(bondBenchmark){const rows=await env.DB.prepare('SELECT * FROM bond_benchmark_observations WHERE bond_id=? ORDER BY observation_date DESC LIMIT 1000').bind(bondBenchmark[1]).all();return json({bondId:bondBenchmark[1],observations:rows.results,sourceStatus:bondSourceStatus()});}
  const bondDetail=request.method==='GET'?url.pathname.match(/^\/api\/bonds\/([^/]+)$/):null;
  if(bondDetail){const data=await getBondUniverse(env.DB);const bond=data.rows.find(x=>x.id===bondDetail[1])??null;if(!bond)return json({bond:null,sourceStatus:bondSourceStatus()},404);const cashflows=await env.DB.prepare('SELECT payment_date AS paymentDate,coupon_amount AS couponAmount,principal_percentage AS principalPercentage,source_url AS sourceUrl,ingested_at AS ingestedAt,revision FROM bond_cashflows WHERE bond_id=? ORDER BY payment_date,revision DESC').bind(bond.id).all();return json({bond,cashflows:cashflows.results,sourceStatus:bondSourceStatus()});}
  if (request.method === 'GET' && (url.pathname === '/api/overview' || url.pathname === '/api/macro/overview')) return json(await getOverview(env.DB));
  if (request.method === 'GET' && url.pathname === '/api/macro/rates') {
    const history = await getHistory(env.DB, 'boi_policy_rate', 180);
    return json({ observations: history.map(toObservation), source: BOI_RATE_PAGE, unit: '%' });
  }
  if (request.method === 'GET' && url.pathname === '/api/macro/inflation') {
    const history = await getHistory(env.DB, 'cpi_index', 240);
    return json({ ...cpiStats(history), source: CBS_CPI_PAGE, unit: 'index', observations: history.map(toObservation) });
  }
  if (request.method === 'GET' && url.pathname === '/api/macro/risk') {
    const overview = await getOverview(env.DB);
    const signal = overview.signals.find((item) => item.key === 'israel_risk_proxy');
    return json({ status: 'source_pending', signal: signal ?? null, source: null, observations: [] });
  }
  const seriesMatch = request.method === 'GET' ? url.pathname.match(/^\/api\/macro\/series\/([a-z0-9_]+)$/) : null;
  if (seriesMatch) {
    const key = seriesMatch[1];
    const requestedLimit = Number(url.searchParams.get('limit') ?? 500);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.floor(requestedLimit), 2000)) : 500;
    const rows = await getHistory(env.DB, key, limit);
    return json({ key, observations: rows.map(toObservation), source: key === 'cpi_index' ? CBS_CPI_PAGE : BOI_RATE_PAGE });
  }
  const curveMatch = url.pathname.match(/^\/api\/macro\/yield-curve$/);
  if (request.method === 'GET' && curveMatch) {
    const type = url.searchParams.get('type');
    if (type !== 'real' && type !== 'nominal') return json({ error: 'type must be real or nominal' }, 400);
    return json({ type, observations: await getCurve(env.DB, type), source: BOI_CURVE_PAGE, sourceFrequency: 'calendar and CPI-dated averages, published approximately twice per month' });
  }
  if (request.method === 'GET' && url.pathname === '/api/macro/inflation-expectations') { const o=await getOverview(env.DB); return json(o.expectations); }
  if (request.method === 'GET' && url.pathname === '/api/markets/usdils') return json((await getOverview(env.DB)).markets.usdIls);
  if (request.method === 'GET' && url.pathname === '/api/markets/us10y') return json((await getOverview(env.DB)).markets.us10yNominal);
  if (request.method === 'GET' && url.pathname === '/api/markets/us-real-10y') return json((await getOverview(env.DB)).markets.us10yReal);
  if (request.method === 'GET' && url.pathname === '/api/markets/real-yield-differential') return json((await getOverview(env.DB)).markets.realYieldDifferential);
  if (request.method === 'GET' && url.pathname === '/api/risk/israel-proxy') return json((await getOverview(env.DB)).markets.riskProxy);
  if (request.method === 'GET' && url.pathname === '/api/changes/today') return json((await getOverview(env.DB)).changes);
  if (request.method === 'GET' && url.pathname === '/api/regime/history') return json({history:await getRegimeHistory(env.DB)});
  if (request.method === 'GET' && url.pathname === '/api/signals/current') return json({ signals: (await getOverview(env.DB)).signals });
  if (request.method === 'GET' && url.pathname === '/api/regime/current') return json({ regime: (await getOverview(env.DB)).regime });
  if (request.method === 'GET' && url.pathname === '/api/signals/history') {
    const from = url.searchParams.get('from') ?? '0001-01-01';
    const to = url.searchParams.get('to') ?? '9999-12-31';
    const snapshots = await env.DB.prepare('SELECT signal_key AS signalKey, observation_date AS observationDate, status, score, value_json AS valueJson, explanation_he AS explanationHe, revision_number AS revisionNumber, created_at AS createdAt FROM latest_signal_snapshots WHERE observation_date BETWEEN ? AND ? ORDER BY observation_date DESC, signal_key').bind(from, to).all();
    return json({ snapshots: snapshots.results });
  }
  if (request.method === 'GET' && url.pathname === '/api/sources/status') return json({ sources: await getSourceStatuses(env.DB) });
  if (request.method === 'GET' && url.pathname === '/api/ingestion/status') {
    const runs = await env.DB.prepare('SELECT job_key AS jobKey, started_at AS startedAt, completed_at AS completedAt, status, records_read AS recordsRead, records_written AS recordsWritten, error_message AS errorMessage, details_json AS detailsJson FROM ingestion_runs ORDER BY started_at DESC LIMIT 40').all();
    return json({ runs: runs.results.map((run) => {
      const row = run as Record<string, unknown>;
      const raw = typeof row.errorMessage === 'string' ? row.errorMessage : '';
      const failureKind = !raw ? null : /timeout|timed out|abort/i.test(raw) ? 'timeout' : /malformed|invalid|empty|no valid/i.test(raw) ? 'malformed' : 'unavailable';
      return { ...row, errorMessage: raw ? 'source_ingestion_failed' : null, failureKind };
    }) });
  }
  return json({ error: 'Not found' }, 404);
}

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'https://bond-analyzer-av2.pages.dev'];

function isAllowedOrigin(origin: string, env: Env): boolean {
  const allowed = env.ALLOWED_ORIGINS === undefined
    ? DEFAULT_ALLOWED_ORIGINS
    : env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin);
}

function addCorsHeaders(response: Response, origin: string | null, env: Env): Response {
  const headers = new Headers(response.headers);
  headers.append('Vary', 'Origin');
  if (origin && isAllowedOrigin(origin, env)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Accept, Content-Type');
    headers.set('Access-Control-Max-Age', '600');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/ingest') return handleManualIngestion(request, env);
    if (url.pathname.startsWith('/api/')) {
      const origin = request.headers.get('Origin');
      if (origin && !isAllowedOrigin(origin, env)) return addCorsHeaders(json({ error: 'Origin not allowed' }, 403), null, env);
      if (request.method === 'OPTIONS') return addCorsHeaders(new Response(null, { status: 204 }), origin, env);
      try { return addCorsHeaders(await handleApi(request, env), origin, env); }
      catch { return addCorsHeaders(json({ error: 'Internal server error' }, 500), origin, env); }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      console.log('Scheduled dashboard ingestion started');
      await runProductionIngestion(env.DB);
      console.log('Scheduled dashboard ingestion completed');
    })());
  },
};

export const __test = { cpiStats, createRealYieldDifferential, handleManualIngestion, manualIngestionSources, runProductionIngestion };
