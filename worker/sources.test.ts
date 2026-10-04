import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { fetchCbsCpiWithFallback, parseBoiCurve, parseBoiExchangeHistory, parseBoiExchangeRate, parseBoiInflationExpectations, parseCbsCpi, parseCbsCpiXml, parseFredSeries, parsePolicyRate, parseTreasuryNominalCurve, parseTreasuryRealCurve } from './sources';

const cpiXml = `<?xml version="1.0"?><DataSetIndex><month><CodeMonth><code>120010</code><name>CPI</name><date><DateMonth><year>2025</year><month>1</month><currBase><value>100</value></currBase></DateMonth><DateMonth><year>2025</year><month>2</month><currBase><value>101</value></currBase></DateMonth></date></CodeMonth><CodeMonth><code>123456</code><date><DateMonth><year>2025</year><month>2</month><currBase><value>999</value></currBase></DateMonth></date></CodeMonth></month></DataSetIndex>`;

afterEach(() => vi.unstubAllGlobals());

describe('source payload normalization', () => {
  it('validates Bank of Israel policy rate responses without substituting defaults', () => {
    expect(parsePolicyRate({ currentInterest: 0, nextInterestDate: '2026-11-01T00:00:00Z' })).toEqual({ value: 0, nextDecisionDate: '2026-11-01T00:00:00Z' });
    expect(() => parsePolicyRate({ currentInterest: 'unavailable' })).toThrow(/plausible/);
  });

  it('normalizes CBS monthly observations to month-end periods and ignores malformed rows', async () => {
    const payload = { month: [{ code: 120010, date: [
      { year: 2026, month: 1, currBase: { value: 100 } },
      { year: 2026, month: 2, currBase: { value: 101 } },
      { year: 2026, month: 3, currBase: { value: 'bad' } },
    ] }] };
    const rows = await parseCbsCpi(payload);
    expect(rows.map((row) => row.date)).toEqual(['2026-01-31', '2026-02-28']);
    expect(rows[0].value).toBe(100);
    expect(rows[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].source).toBe('CBS');
  });

  it('parses official CBS XML only for the verified headline series and keeps actual monthly dates', async () => {
    const rows = await parseCbsCpiXml(cpiXml);
    expect(rows.map(({ date, value }) => [date, value])).toEqual([['2025-01-31', 100], ['2025-02-28', 101]]);
    const jsonRows = await parseCbsCpi({ month: [{ code: 120010, date: [{ year: 2025, month: 1, currBase: { value: 100 } }] }] });
    expect(rows[0].hash).toBe(jsonRows[0].hash);
    await expect(parseCbsCpiXml(cpiXml.replaceAll('120010', '120011'))).rejects.toThrow(/does not identify/);
  });

  it('sends CBS User-Agent and falls back from failed JSON transport to official XML', async () => {
    const calls: Request[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Request(input, init));
      return calls.length === 1 ? new Response('upstream unavailable', { status: 522 }) : new Response(cpiXml, { status: 200, headers: { 'content-type': 'application/xml' } });
    }));
    const result = await fetchCbsCpiWithFallback('https://cbs.example/price?format=json', 'https://cbs.example/price?format=xml');
    expect(result.formatUsed).toBe('xml');
    expect(result.rows).toHaveLength(2);
    expect(calls.map((request) => request.headers.get('user-agent'))).toEqual([
      'bond-analyzer/1.0 (Israel macro dashboard)', 'bond-analyzer/1.0 (Israel macro dashboard)',
    ]);
    expect(calls[0].headers.get('accept')).toContain('application/json');
  });

  it('uses valid CBS JSON as the primary response without requesting XML', async () => {
    const payload = JSON.stringify({ month: [{ code: 120010, date: [{ year: 2025, month: 1, currBase: { value: 100 } }] }] });
    const fetchMock = vi.fn(async () => new Response(payload, { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchCbsCpiWithFallback('https://cbs.example/json', 'https://cbs.example/xml');
    expect(result.formatUsed).toBe('json');
    expect(result.rows[0]).toMatchObject({ date: '2025-01-31', value: 100, source: 'CBS' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses JSON first and reports a sanitized failure when both CBS formats fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway error', { status: 522 })));
    await expect(fetchCbsCpiWithFallback('https://cbs.example/json', 'https://cbs.example/xml')).rejects.toThrow('CBS_CPI_UNAVAILABLE');
  });


  it('parses BOI USD live and historical observations without filling market gaps', async () => {
    const current=await parseBoiExchangeRate({key:'USD',currentExchangeRate:3.5,lastUpdate:'2026-10-01T12:00:00Z'});
    expect(current.date).toBe('2026-10-01');
    const rows=await parseBoiExchangeHistory('SERIES_CODE,TIME_PERIOD,OBS_VALUE\nRER_USD_ILS,2026-09-28,3.4\nRER_USD_ILS,2026-10-01,3.5');
    expect(rows.map(x=>x.date)).toEqual(['2026-09-28','2026-10-01']);
  });

  it('parses FRED daily series, ignores missing values and keeps business-day gaps', async () => {
    const csv='observation_date,DGS10\n2026-09-25,4.1\n2026-09-26,.\n2026-09-28,4.2';
    const rows=await parseFredSeries(csv,'DGS10');
    expect(rows.map(x=>x.date)).toEqual(['2026-09-25','2026-09-28']);
  });

  it('parses DGS2 and T10YIE from official FRED CSV column names without filling missing days', async () => {
    const twoYear = await parseFredSeries('observation_date,DGS2\n2026-09-29,4.89\n2026-09-30,.\n2026-10-01,4.78', 'DGS2');
    const breakeven = await parseFredSeries('observation_date,T10YIE\n2026-09-29,2.37\n2026-09-30,.\n2026-10-01,2.40', 'T10YIE');
    expect(twoYear.map((row) => [row.date, row.value])).toEqual([['2026-09-29', 4.89], ['2026-10-01', 4.78]]);
    expect(breakeven.map((row) => [row.date, row.value])).toEqual([['2026-09-29', 2.37], ['2026-10-01', 2.4]]);
  });

  it('parses official Treasury nominal and real CSVs, skips N/A and invalid dates, and preserves gaps', async () => {
    const nominal = await parseTreasuryNominalCurve('Date,"2 Yr","10 Yr"\n10/02/2026,4.83,5.28\n10/01/2026,4.78,5.24\n09/30/2026,N/A,5.29\n09/29/2026,4.70,5.20\n02/30/2026,4.7,5.2');
    const real = await parseTreasuryRealCurve('Date,"5 YR","10 YR"\n10/02/2026,2.69,2.92\n10/01/2026,2.65,2.88\n09/30/2026,2.73,N/A');
    expect(nominal.twoYear.map((row) => [row.date, row.value])).toEqual([['2026-09-29', 4.7], ['2026-10-01', 4.78], ['2026-10-02', 4.83]]);
    expect(nominal.tenYear.map((row) => row.date)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(real.map((row) => [row.date, row.value])).toEqual([['2026-10-01', 2.88], ['2026-10-02', 2.92]]);
  });

  it('maps BOI expectations tenors and rejects a workbook without the source table', async () => {
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([['Date','Date','Expected inflation rate 1Y','','','','5 years','years 5-10','forecasters 12m'],[null,46200,2.1,null,null,null,2.4,2.6,2.2]]);
    XLSX.utils.book_append_sheet(wb,ws,'expectations');
    const bytes=XLSX.write(wb,{type:'array',bookType:'xlsx'}) as ArrayBuffer;
    const result=await parseBoiInflationExpectations(bytes,'2026-10-01T00:00:00Z');
    expect(result.il_bei_1y[0].value).toBe(2.1);
    expect(result.il_bei_5y[0].value).toBe(2.4);
    expect(result.il_bei_5y5y[0].value).toBe(2.6);
    expect(result.il_forecast_cpi_12m[0].value).toBe(2.2);
    const empty=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(empty,XLSX.utils.aoa_to_sheet([['unrecognized']]),'other');
    await expect(parseBoiInflationExpectations(XLSX.write(empty,{type:'array',bookType:'xlsx'}) as ArrayBuffer,null)).rejects.toThrow(/header/);
  });

  it('reads BOI workbook tenors and historical date/value rows', () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Nominal rate of return'], ['Year', 'Month', 'Average type', 'Term to maturity (years)'], [null, null, null, 1, 2, 5, 10],
      [2026, 46200, 'Calendar', 1.1, 1.4, 1.9, 2.2, null],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'nominal');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const points = parseBoiCurve(buffer);
    expect(points.map((point) => point.tenorYears)).toEqual([1, 2, 5, 10]);
    expect(points.some((point) => point.tenorYears === 0)).toBe(false);
    expect(points.every((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date))).toBe(true);
  });
});
