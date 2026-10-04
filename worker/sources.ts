import * as XLSXModule from 'xlsx';

const XLSX = (Reflect.get(XLSXModule, 'default') ?? XLSXModule) as typeof XLSXModule;

export interface NormalizedObservation {
  date: string;
  value: number;
  sourceTimestamp: string | null;
  hash: string;
}

export interface YieldPoint {
  date: string;
  tenorYears: number;
  value: number;
}

export interface FetchResult<T> {
  rows: T[];
  sourceTimestamp: string | null;
  rawHash: string;
  sourceUrl: string;
}

export interface SourceValue {
  date: string;
  value: number;
  sourceTimestamp: string | null;
  hash: string;
}

export type ExpectationsSeriesKey = 'il_bei_1y' | 'il_bei_5y' | 'il_bei_5y5y' | 'il_forecast_cpi_12m';

export function parsePolicyRate(payload: unknown): { value: number; nextDecisionDate: string | null } {
  if (!payload || typeof payload !== 'object') throw new Error('BOI rate API returned a non-object payload');
  const record = payload as Record<string, unknown>;
  const value = Number(record.currentInterest);
  if (!Number.isFinite(value) || value < 0 || value > 30) throw new Error('BOI rate payload has no plausible currentInterest');
  const next = typeof record.nextInterestDate === 'string' && !Number.isNaN(Date.parse(record.nextInterestDate)) ? record.nextInterestDate : null;
  return { value, nextDecisionDate: next };
}

async function sha256Hex(data: BufferSource): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function parseCbsCpi(payload: unknown, sourceTimestamp: string | null = null): Promise<NormalizedObservation[]> {
  if (!payload || typeof payload !== 'object') throw new Error('CBS CPI API returned a non-object payload');
  const root = payload as { month?: unknown };
  if (!Array.isArray(root.month)) throw new Error('CBS CPI payload is missing monthly observations');
  const rows: NormalizedObservation[] = [];
  for (const group of root.month) {
    if (!group || typeof group !== 'object') continue;
    const dates = (group as { date?: unknown }).date;
    if (!Array.isArray(dates)) continue;
    for (const item of dates) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      const year = Number(entry.year);
      const month = Number(entry.month);
      const currBase = entry.currBase as { value?: unknown } | undefined;
      const value = Number(currBase?.value);
      if (!Number.isInteger(year) || month < 1 || month > 12 || !Number.isFinite(value) || value <= 0) continue;
      const date = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      rows.push({ date, value, sourceTimestamp, hash: await sha256Hex(new TextEncoder().encode(JSON.stringify(item))) });
    }
  }
  if (!rows.length) throw new Error('CBS CPI payload contained no valid index levels');
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function excelDate(value: unknown): string | null {
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
  }
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed?.y || !parsed.m || !parsed.d) return null;
  return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { fields.push(field); field = ''; }
    else field += char;
  }
  fields.push(field);
  return fields;
}

function rowsFromCsv(text: string): string[][] {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.length > 0).map(parseCsvLine);
}

async function normalizedValue(date: string, rawValue: unknown, sourceTimestamp: string | null, context: unknown): Promise<SourceValue | null> {
  const value = Number(rawValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) return null;
  return { date, value, sourceTimestamp, hash: await sha256Hex(new TextEncoder().encode(JSON.stringify(context))) };
}

export async function parseBoiExchangeRate(payload: unknown): Promise<{ value: number; date: string; sourceTimestamp: string; hash: string }> {
  if (!payload || typeof payload !== 'object') throw new Error('BOI exchange-rate API returned a non-object payload');
  const record = payload as Record<string, unknown>;
  const value = Number(record.currentExchangeRate);
  const timestamp = typeof record.lastUpdate === 'string' ? record.lastUpdate : '';
  const parsedAt = Date.parse(timestamp);
  if (record.key !== 'USD' || !Number.isFinite(value) || value <= 0 || value > 100 || !Number.isFinite(parsedAt)) throw new Error('BOI USD exchange-rate payload is invalid');
  return { value, date: new Date(parsedAt).toISOString().slice(0, 10), sourceTimestamp: new Date(parsedAt).toISOString(), hash: await sha256Hex(new TextEncoder().encode(JSON.stringify(record))) };
}

export async function parseBoiExchangeHistory(csv: string, sourceTimestamp: string | null = null): Promise<SourceValue[]> {
  const rows = rowsFromCsv(csv);
  const headers = rows[0] ?? [];
  const dateIndex = headers.indexOf('TIME_PERIOD');
  const valueIndex = headers.indexOf('OBS_VALUE');
  const seriesIndex = headers.indexOf('SERIES_CODE');
  if (dateIndex < 0 || valueIndex < 0 || seriesIndex < 0) throw new Error('BOI exchange history CSV has an unrecognized header');
  const result: SourceValue[] = [];
  for (const row of rows.slice(1)) {
    if (row[seriesIndex] !== 'RER_USD_ILS') continue;
    const observation = await normalizedValue(row[dateIndex] ?? '', row[valueIndex], sourceTimestamp, row);
    if (observation && observation.value > 0 && observation.value < 100) result.push(observation);
  }
  if (!result.length) throw new Error('BOI exchange history contains no valid RER_USD_ILS observations');
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export type FredSeriesId = 'DGS2' | 'DGS10' | 'DFII10' | 'T10YIE';

export async function parseFredSeries(csv: string, seriesId: FredSeriesId, sourceTimestamp: string | null = null): Promise<SourceValue[]> {
  const rows = rowsFromCsv(csv);
  const headers = rows[0] ?? [];
  const dateIndex = headers.indexOf('observation_date');
  const valueIndex = headers.indexOf(seriesId);
  if (dateIndex < 0 || valueIndex < 0) throw new Error(`FRED ${seriesId} CSV has an unrecognized header`);
  const result: SourceValue[] = [];
  for (const row of rows.slice(1)) {
    const textValue = row[valueIndex]?.trim();
    if (!textValue || textValue === '.') continue;
    const observation = await normalizedValue(row[dateIndex] ?? '', textValue, sourceTimestamp, row);
    if (!observation || observation.value < -10 || observation.value > 40) continue;
    result.push(observation);
  }
  if (!result.length) throw new Error(`FRED ${seriesId} CSV contains no valid daily observations`);
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export async function parseBoiInflationExpectations(buffer: ArrayBuffer, sourceTimestamp: string | null): Promise<Record<ExpectationsSeriesKey, SourceValue[]>> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => /inflation|אינפלציה/i.test(name));
  const worksheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error('BOI inflation-expectations workbook has no worksheet');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, raw: true });
  const headingIndex = rows.findIndex((row) => row.some((cell) => cell === 'Date') && row.some((cell) => typeof cell === 'string' && /Expected inflation rate/i.test(cell)));
  if (headingIndex < 0) throw new Error('BOI inflation-expectations workbook has no recognized Date/Expected inflation header');
  const keys: ExpectationsSeriesKey[] = ['il_bei_1y', 'il_bei_5y', 'il_bei_5y5y', 'il_forecast_cpi_12m'];
  const columns = [2, 6, 7, 8];
  const output: Record<ExpectationsSeriesKey, SourceValue[]> = { il_bei_1y: [], il_bei_5y: [], il_bei_5y5y: [], il_forecast_cpi_12m: [] };
  for (const row of rows.slice(headingIndex + 1)) {
    const date = excelDate(row[1]);
    if (!date) continue;
    const parsed: Array<{ key: ExpectationsSeriesKey; value: number }> = [];
    for (let index = 0; index < keys.length; index += 1) {
      const value = Number(row[columns[index]]);
      if (Number.isFinite(value) && value >= -10 && value <= 30) parsed.push({ key: keys[index], value });
    }
    if (parsed.length !== keys.length) continue;
    for (const item of parsed) {
      const observation = await normalizedValue(date, item.value, sourceTimestamp, { date, key: item.key, value: item.value });
      if (observation) output[item.key].push(observation);
    }
  }
  if (keys.some((key) => !output[key].length)) throw new Error('BOI inflation-expectations workbook is missing one or more required tenor series');
  for (const key of keys) output[key].sort((a, b) => a.date.localeCompare(b.date));
  const latestDates = keys.map((key) => output[key].at(-1)?.date);
  if (latestDates.some((date) => date !== latestDates[0])) throw new Error('BOI inflation-expectations latest series periods do not align');
  return output;
}

export function parseBoiCurve(buffer: ArrayBuffer): YieldPoint[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error('BOI curve workbook contains no worksheet');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, raw: true });
  const headerIndex = rows.findIndex((row) => row[0] === 'Year' && row[1] === 'Month');
  if (headerIndex < 0) throw new Error('BOI curve workbook has no recognized Year/Month header');
  const tenors = (rows[headerIndex + 1]?.slice(3) ?? [])
    .map((value, index) => ({ tenor: Number(value), columnIndex: index }))
    .filter((item) => Number.isFinite(item.tenor) && item.tenor > 0);
  if (!tenors.length) throw new Error('BOI curve workbook has an invalid tenor row');
  const result: YieldPoint[] = [];
  for (const row of rows.slice(headerIndex + 2)) {
    const date = excelDate(row[1]);
    if (!date) continue;
    for (const { tenor, columnIndex } of tenors) {
      const value = Number(row[columnIndex + 3]);
      if (!Number.isFinite(value)) continue;
      result.push({ date, tenorYears: tenor, value });
    }
  }
  if (!result.length) throw new Error('BOI curve workbook contains no valid yield observations');
  return result;
}

export async function fetchJson<T>(url: string): Promise<{ body: T; rawHash: string; sourceUrl: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const text = await response.text();
  try {
    return { body: JSON.parse(text) as T, rawHash: await sha256Hex(new TextEncoder().encode(text)), sourceUrl: url };
  } catch {
    throw new Error('Source returned malformed JSON');
  }
}

export async function fetchWorkbook(url: string): Promise<{ buffer: ArrayBuffer; rawHash: string; sourceUrl: string; sourceTimestamp: string | null }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { accept: 'application/vnd.ms-excel, application/octet-stream' } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 512) throw new Error('Source returned an empty/invalid workbook');
  const signature = new Uint8Array(buffer.slice(0, 8));
  const isOle = signature[0] === 0xd0 && signature[1] === 0xcf;
  const isZip = signature[0] === 0x50 && signature[1] === 0x4b;
  if (!isOle && !isZip) throw new Error('Source payload is not an Excel workbook');
  const lastModified = response.headers.get('last-modified');
  const sourceTimestamp = lastModified && Number.isFinite(Date.parse(lastModified)) ? new Date(lastModified).toISOString() : null;
  return { buffer, rawHash: await sha256Hex(buffer), sourceUrl: url, sourceTimestamp };
}

export async function fetchText(url: string, accept = 'text/csv, text/plain, text/html'): Promise<{ text: string; rawHash: string; sourceUrl: string; sourceTimestamp: string | null }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { accept, 'user-agent': 'IsraelMacroRatesDashboard/1.0 (official-source ingestion)' } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const text = await response.text();
  if (!text.trim()) throw new Error('Source returned an empty text payload');
  const lastModified = response.headers.get('last-modified');
  return { text, rawHash: await sha256Hex(new TextEncoder().encode(text)), sourceUrl: url, sourceTimestamp: lastModified && Number.isFinite(Date.parse(lastModified)) ? new Date(lastModified).toISOString() : null };
}
