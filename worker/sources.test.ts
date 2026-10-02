import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBoiCurve, parseBoiExchangeHistory, parseBoiExchangeRate, parseBoiInflationExpectations, parseCbsCpi, parseFredSeries, parsePolicyRate } from './sources';

describe('source payload normalization', () => {
  it('validates Bank of Israel policy rate responses without substituting defaults', () => {
    expect(parsePolicyRate({ currentInterest: 0, nextInterestDate: '2026-11-01T00:00:00Z' })).toEqual({ value: 0, nextDecisionDate: '2026-11-01T00:00:00Z' });
    expect(() => parsePolicyRate({ currentInterest: 'unavailable' })).toThrow(/plausible/);
  });

  it('normalizes CBS monthly observations to month-end periods and ignores malformed rows', async () => {
    const payload = { month: [{ date: [
      { year: 2026, month: 1, currBase: { value: 100 } },
      { year: 2026, month: 2, currBase: { value: 101 } },
      { year: 2026, month: 3, currBase: { value: 'bad' } },
    ] }] };
    const rows = await parseCbsCpi(payload);
    expect(rows.map((row) => row.date)).toEqual(['2026-01-31', '2026-02-28']);
    expect(rows[0].value).toBe(100);
    expect(rows[0].hash).toMatch(/^[a-f0-9]{64}$/);
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
