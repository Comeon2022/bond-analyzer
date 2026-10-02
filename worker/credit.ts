export const BOI_SECDWH_CSV_URL = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/SECDWH/1.0/?format=csv&lastNObservations=24';
export const BOI_SECDWH_DSD_URL = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/structure/datastructure/BOI.STATISTICS/SECDWH/1.0';
export const BOI_SECDWH_FLOW_URL = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/structure/dataflow/BOI.STATISTICS';
export const BOI_SECDWH_PAGE_URL = 'https://www.boi.org.il/roles/statistics/makamandbonds/yield/';

export interface BoiCreditRow {
  seriesCode: string;
  frequency: string;
  dataType: string;
  compCategoryCode: string;
  compNameCode: string;
  indexationTypeCode: string;
  secRankGroupCode: string;
  issuerSectorCode: string;
  timePeriod: string;
  observationValue: number;
  releaseStatus: string | null;
  unitMeasure: string;
  payloadHash: string;
}

export interface CreditMetadata {
  codelists: Record<string, Record<string, string>>;
  fetchedAt: string;
  unresolvedCount: number;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { fields.push(field); field = ''; }
    else field += char;
  }
  fields.push(field);
  return fields;
}

function sha256Hex(value: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then((hash) =>
    [...new Uint8Array(hash)].map((part) => part.toString(16).padStart(2, '0')).join(''));
}

function validPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function parseBoiCreditCsv(csv: string): Promise<BoiCreditRow[]> {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) throw new Error('BOI SECDWH bulk CSV is empty');
  const header = splitCsvLine(lines[0]);
  const required = ['SERIES_CODE', 'DATA_TYPE', 'TIME_PERIOD', 'OBS_VALUE'];
  const indices = Object.fromEntries(required.map((key) => [key, header.indexOf(key)]));
  if (required.some((key) => indices[key] < 0)) throw new Error('BOI SECDWH CSV is missing required columns');
  const optional = (key: string) => header.indexOf(key);
  const get = (row: string[], name: string): string => {
    const index = optional(name);
    return index < 0 ? '' : (row[index] ?? '').trim();
  };
  const rows: BoiCreditRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const dataType = (cells[indices.DATA_TYPE] ?? '').trim();
    if (dataType !== 'SPR') continue;
    const seriesCode = (cells[indices.SERIES_CODE] ?? '').trim();
    const timePeriod = (cells[indices.TIME_PERIOD] ?? '').trim();
    const observationValue = Number((cells[indices.OBS_VALUE] ?? '').trim());
    if (!seriesCode || !validPeriod(timePeriod) || !Number.isFinite(observationValue)) continue;
    const rowObject = Object.fromEntries(header.map((name, index) => [name, cells[index] ?? '']));
    rows.push({
      seriesCode,
      frequency: get(cells, 'FREQ'),
      dataType,
      compCategoryCode: get(cells, 'COMP_CATEGORY'),
      compNameCode: get(cells, 'COMP_NAME'),
      indexationTypeCode: get(cells, 'INDEXATION_TYPE'),
      secRankGroupCode: get(cells, 'SEC_RANK_GROUP'),
      issuerSectorCode: get(cells, 'ISSUER_SECTOR'),
      timePeriod,
      observationValue,
      releaseStatus: get(cells, 'RELEASE_STATUS') || null,
      unitMeasure: get(cells, 'UNIT_MEASURE'),
      payloadHash: await sha256Hex(JSON.stringify(rowObject)),
    });
  }
  if (!rows.length) throw new Error('BOI SECDWH bulk CSV contained no valid DATA_TYPE=SPR observations');
  return rows.sort((a, b) => a.timePeriod.localeCompare(b.timePeriod) || a.seriesCode.localeCompare(b.seriesCode));
}

function decodeXml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

export function parseBoiDsdCodelistRefs(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const dimension of ['COMP_CATEGORY', 'COMP_NAME', 'INDEXATION_TYPE', 'SEC_RANK_GROUP', 'ISSUER_SECTOR', 'UNIT_MEASURE']) {
    const block = xml.match(new RegExp(`<[^>]*(?:Dimension|Attribute)\\b(?=[^>]*\\bid=["']${dimension}["'])[^>]*>([\\s\\S]*?)<\\/[^>]*(?:Dimension|Attribute)\\s*>`, 'i'))?.[1];
    const codeList = block?.match(/<[^>]*Ref\b[^>]*\bid=["']([^"']+)["'][^>]*class=["']Codelist["'][^>]*\/?\s*>/i)?.[1];
    if (codeList) result[dimension] = codeList;
  }
  return result;
}

export function parseBoiCodelist(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const codePattern = /<[^>]*Code\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/[^>]*Code\s*>/gi;
  for (const match of xml.matchAll(codePattern)) {
    const code = decodeXml(match[1]);
    const block = match[2];
    const hebrew = [...block.matchAll(/<[^>]*Name\b[^>]*xml:lang=["']he["'][^>]*>([\s\S]*?)<\/[^>]*Name\s*>/gi)][0]?.[1];
    const english = [...block.matchAll(/<[^>]*Name\b[^>]*xml:lang=["']en["'][^>]*>([\s\S]*?)<\/[^>]*Name\s*>/gi)][0]?.[1];
    const label = hebrew ?? english;
    if (label) result[code] = decodeXml(label.replace(/<[^>]+>/g, ''));
  }
  return result;
}

export function resolveOfficialLabel(metadata: CreditMetadata, dimension: string, code: string): string {
  if (!code) return 'לא זמין';
  const label = metadata.codelists[dimension]?.[code];
  return label && label !== '__UNRESOLVED__' ? label : `${code} — לא זוהה במטא־דאטה`;
}

export function shiftMonthlyPeriod(period: string, months: number): string | null {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface CreditObservation { timePeriod: string; observationValue: number; }
export function creditChanges(history: CreditObservation[], valueToBpFactor: number | null = 100) {
  const sorted = [...history].sort((a, b) => a.timePeriod.localeCompare(b.timePeriod));
  const latest = sorted.at(-1);
  if (!latest) return { change1m: null, change3m: null, change12m: null };
  const byPeriod = new Map(sorted.map((row) => [row.timePeriod, row.observationValue]));
  const difference = (months: number): number | null => {
    if (valueToBpFactor === null) return null;
    const priorPeriod = shiftMonthlyPeriod(latest.timePeriod, -months);
    const prior = priorPeriod ? byPeriod.get(priorPeriod) : undefined;
    return prior === undefined ? null : Math.round((latest.observationValue - prior) * valueToBpFactor * 100) / 100;
  };
  return { change1m: difference(1), change3m: difference(3), change12m: difference(12) };
}

export function isCreditSeriesStale(period: string, now = new Date()): boolean {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) return true;
  const latestMonth = Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
  const currentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return (currentMonth - latestMonth) / (30 * 24 * 60 * 60 * 1000) > 2;
}

export function creditChangeBullet(label: string, changeBp: number | null, months: 1 | 3): string | null {
  if (changeBp === null || !Number.isFinite(changeBp) || Math.abs(changeBp) < 0.5) return null;
  const direction = changeBp > 0 ? 'עלה' : 'ירד';
  const amount = Math.abs(changeBp).toLocaleString('he-IL', { maximumFractionDigits: 1 });
  return `המרווח בסדרה ${label} ${direction} ב־${amount} נ״ב לעומת ${months === 1 ? 'החודש הקודם' : 'לפני שלושה חודשים'}.`;
}

export async function fetchBoiXml(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { accept: 'application/vnd.sdmx.structure+xml;version=2.1, application/xml' } });
  if (!response.ok) throw new Error(`BOI metadata returned HTTP ${response.status}`);
  const xml = await response.text();
  if (!xml.includes('<')) throw new Error('BOI metadata response is not XML');
  return xml;
}
