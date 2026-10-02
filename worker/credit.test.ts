import { describe, expect, it } from 'vitest';
import { BOI_SECDWH_CSV_URL, creditChanges, creditChangeBullet, isCreditSeriesStale, parseBoiCodelist, parseBoiCreditCsv, parseBoiDsdCodelistRefs, resolveOfficialLabel } from './credit';

const header = 'SERIES_CODE,FREQ,DATA_TYPE,COMP_CATEGORY,COMP_NAME,INDEXATION_TYPE,SEC_RANK_GROUP,TIME_TO_MATURITY,ISSUER_SECTOR,UNIT_MEASURE,TIME_PERIOD,OBS_VALUE,RELEASE_STATUS';
const line = (series: string, type: string, period: string, value: string, name = 'unknown') => `${series},M,${type},CB_R,${name},NI,_Z,A,_Z,PT,${period},${value},YP`;

describe('BOI SECDWH corporate spread ingestion', () => {
  it('uses the official bulk endpoint and filters DATA_TYPE=SPR locally', async () => {
    const csv = [header, line('DWH_SRC_0299_MA', 'SPR', '2026-08', '1.2', 'I710'), line('DWH_SRC_0345', 'YTM', '2026-09', '3.1'), line('DWH_SRC_0299_MA', 'SPR', '2026-09', '1.3', 'I710')].join('\n');
    const rows = await parseBoiCreditCsv(csv);
    expect(BOI_SECDWH_CSV_URL).toContain('SECDWH/1.0/?format=csv&lastNObservations=24');
    expect(rows.map((row) => row.seriesCode)).toEqual(['DWH_SRC_0299_MA', 'DWH_SRC_0299_MA']);
    expect(rows[0].timePeriod).toBe('2026-08');
    expect(rows[0].payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('discovers all currently verified spread series without a hard-coded series allowlist', async () => {
    const csv = [header, line('DWH_SRC_0299_MA', 'SPR', '2026-09', '1.3029846514', 'I710'), line('DWH_SRC_0438_MA_T', 'SPR', '2026-09', '0.5408625429', 'BS1096'), line('DWH_SRC_0498_MA_T', 'SPR', '2026-09', '2.9170251184', 'BS1006')].join('\n');
    const rows = await parseBoiCreditCsv(csv);
    expect([...new Set(rows.map((row) => row.seriesCode))].sort()).toEqual(['DWH_SRC_0299_MA', 'DWH_SRC_0438_MA_T', 'DWH_SRC_0498_MA_T']);
  });

  it('skips malformed observations and fails an empty spread pull without replacing stored data', async () => {
    const csv = [header, line('DWH_SRC_BAD', 'SPR', '2026-13', '1.2'), line('DWH_SRC_BAD', 'SPR', '2026-09', 'NaN'), line('DWH_SRC_YTM', 'YTM', '2026-09', '3')].join('\n');
    await expect(parseBoiCreditCsv(csv)).rejects.toThrow('no valid DATA_TYPE=SPR');
    await expect(parseBoiCreditCsv('SERIES_CODE,DATA_TYPE,TIME_PERIOD,OBS_VALUE\n')).rejects.toThrow('empty');
  });

  it('reads Hebrew labels and dimension codelist ids from official BOI SDMX metadata only', () => {
    const dsd = `<str:Dimension id="COMP_CATEGORY"><str:LocalRepresentation><str:Enumeration><Ref id="CL_DWH_COMP_CATEGORY" class="Codelist"/></str:Enumeration></str:LocalRepresentation></str:Dimension><str:Dimension id="ISSUER_SECTOR"><str:LocalRepresentation><str:Enumeration><Ref id="CL_SECTOR" class="Codelist"/></str:Enumeration></str:LocalRepresentation></str:Dimension>`;
    expect(parseBoiDsdCodelistRefs(dsd)).toEqual({ COMP_CATEGORY: 'CL_DWH_COMP_CATEGORY', ISSUER_SECTOR: 'CL_SECTOR' });
    const labels = parseBoiCodelist('<str:Code id="CB_R"><com:Name xml:lang="he">אג״ח קונצרניות לפי דירוג</com:Name></str:Code>');
    expect(labels.CB_R).toBe('אג״ח קונצרניות לפי דירוג');
    expect(resolveOfficialLabel({ codelists: { COMP_CATEGORY: labels }, fetchedAt: '', unresolvedCount: 0 }, 'COMP_CATEGORY', 'NOT_IN_BOI')).toContain('לא זוהה במטא־דאטה');
  });

  it('calculates exact-month bp changes, leaves missing periods unavailable and writes deterministic Hebrew bullets', () => {
    const history = [{ timePeriod: '2025-10', observationValue: 1 }, { timePeriod: '2026-06', observationValue: 1.1 }, { timePeriod: '2026-08', observationValue: 1.18 }, { timePeriod: '2026-09', observationValue: 1.24 }];
    expect(creditChanges(history)).toEqual({ change1m: 6, change3m: 14, change12m: null });
    expect(creditChangeBullet('דירוג A', 6, 1)).toBe('המרווח בסדרה דירוג A עלה ב־6 נ״ב לעומת החודש הקודם.');
    expect(creditChanges([{ timePeriod: '2026-09', observationValue: 1.2 }]).change1m).toBeNull();
  });

  it('marks the latest monthly period stale only after the defined grace period', () => {
    expect(isCreditSeriesStale('2026-09', new Date('2026-10-02T00:00:00Z'))).toBe(false);
    expect(isCreditSeriesStale('2026-06', new Date('2026-10-02T00:00:00Z'))).toBe(true);
  });
});
