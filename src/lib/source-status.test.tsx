import { describe, expect, it } from 'vitest';
import type { SourceStatus } from '../../shared/types';
import { sourceCheckedAt, sourceStatusLabel, sourceStatusNote } from './source-status';
import { renderToStaticMarkup } from 'react-dom/server';
import { SourceStatusPanel } from '../App';

const base: SourceStatus = {
  key: 'cbs_cpi', name: 'מדד המחירים לצרכן', url: 'https://example.test', status: 'error',
  lastSuccessAt: '2026-10-03T10:00:00.000Z', lastErrorAt: '2026-10-04T10:00:00.000Z',
  lastError: 'Source returned HTTP 522', failureKind: 'unavailable', checkedAt: '2026-10-04T10:00:00.000Z',
  observationDate: '2026-09', observationValue: 100.2,
};

describe('source status presentation', () => {
  it('keeps an available prior observation clear when refresh fails and never exposes technical errors', () => {
    const label = sourceStatusLabel(base);
    const note = sourceStatusNote(base) ?? '';
    expect(label).toBe('עדכון נכשל');
    expect(note).toContain('הנתון הקודם נשמר');
    expect(`${label} ${note}`).not.toMatch(/HTTP 522|Source returned HTTP/);
    expect(base.observationDate).toBe('2026-09');
  });

  it('distinguishes timeout and malformed response and shows unavailable when there is no observation', () => {
    expect(sourceStatusNote({ ...base, failureKind: 'timeout' })).toContain('לא הגיב בזמן');
    expect(sourceStatusNote({ ...base, failureKind: 'malformed' })).toContain('מידע לא תקין');
    const missing = { ...base, observationDate: null, observationValue: null };
    expect(sourceStatusNote(missing)).toContain('אין נתון זמין');
    expect(sourceStatusLabel(missing)).toBe('עדכון נכשל');
  });

  it('keeps market observation and latest check timestamps separate', () => {
    expect(base.observationDate).not.toBe(sourceCheckedAt(base));
    expect(sourceCheckedAt(base)).toBe('2026-10-04T10:00:00.000Z');
  });

  it('renders the source panel with friendly copy, separate timestamps, and no upstream error text', () => {
    const html = renderToStaticMarkup(<SourceStatusPanel sources={[base, { ...base, key: 'empty', status: 'error', observationDate: null, observationValue: null }]} />);
    expect(html).toContain('העדכון האחרון נכשל');
    expect(html).toContain('תצפית:');
    expect(html).toContain('נבדק:');
    expect(html).toContain('אין נתון זמין מהמקור');
    expect(html).not.toMatch(/HTTP 522|Source returned HTTP/);
  });
});
