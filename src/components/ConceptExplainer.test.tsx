import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App, { DetailDrawer } from '../App';
import ConceptExplainer, { ConceptExplanationDialog } from './ConceptExplainer';
import { CONCEPT_EXPLANATIONS } from '../lib/concepts';
import { seriesLabel } from '../App';
import type { MacroCard } from '../../shared/types';

describe('Phase 1H accessible concept explanations', () => {
  it('renders an accessible dialog trigger without embedding the explanation in the card markup', () => {
    const html = renderToStaticMarkup(<ConceptExplainer concept="inflation" />);
    expect(html).toContain('<button class="concept-explainer-trigger" type="button" aria-label="הסבר על אינפלציה" aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('concept-dialog');
    expect(html).not.toContain('concept-explainer-content');
  });

  it('provides a modal RTL dialog with screen-reader title and working Escape/outside-close handlers', () => {
    const cancelled: string[] = [];
    const content = CONCEPT_EXPLANATIONS.inflation;
    const dialog = ConceptExplanationDialog({ content, dialogId: 'inflation-help', onCancel: () => cancelled.push('escape'), onClose: () => cancelled.push('outside') });
    expect(dialog.props.role).toBe('dialog');
    expect(dialog.props['aria-modal']).toBe('true');
    expect(dialog.props.dir).toBe('rtl');
    expect(dialog.props['aria-labelledby']).toBe('inflation-help-title');
    dialog.props.onCancel();
    dialog.props.onClick({ target: dialog, currentTarget: dialog } as never);
    expect(cancelled).toEqual(['escape', 'outside']);
    const html = renderToStaticMarkup(dialog);
    expect(html).toContain('מה זה?');
    expect(html).toContain('למה זה חשוב?');
    expect(html).toContain('איך לקרוא את זה?');
  });

  it('provides complete Hebrew explanations for every required macro and bond term', () => {
    const terms = ['policyRate', 'inflation', 'cpiIndex', 'inflationExpectations', 'realYield', 'nominalYield', 'realYield10y', 'longYieldTrend', 'israelRiskProxy', 'corporateCreditSpreads', 'telBondShekeli', 'spread', 'basisPoints', 'yieldCurve', 'signalCoverage', 'confidence', 'duration', 'yieldToMaturity', 'usdIls', 'usNominal2y', 'usNominal10y', 'usReal10y', 'usBreakeven10y', 'us2s10s', 'realYieldDifferential'] as const;
    for (const id of terms) {
      const item = CONCEPT_EXPLANATIONS[id];
      expect(item.title.length).toBeGreaterThan(2);
      expect(item.what.length).toBeGreaterThan(12);
      expect(item.why.length).toBeGreaterThan(12);
      expect(item.howToRead.length).toBeGreaterThan(12);
    }
  });

  it('rebuilds the hero as one status strip and exactly two semantic content columns', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html.split('מצב כולל היום').length - 1).toBe(1);
    expect(html.split('איפה אנחנו היום').length - 1).toBe(1);
    expect(html.split('מבט קדימה').length - 1).toBe(1);
    const statusStart = html.indexOf('class="phase1s-status-strip"');
    const todayStart = html.indexOf('id="regime-title"');
    const forwardStart = html.indexOf('id="forward-title"');
    expect(statusStart).toBeGreaterThanOrEqual(0);
    expect(statusStart).toBeLessThan(todayStart);
    expect(todayStart).toBeLessThan(forwardStart);
    expect(html).not.toContain('regime-rail');
    expect(html).not.toContain('inflation-snapshot');
    expect(html).toContain('class="phase1s-inflation"');
    expect(html).toContain('מבט קדימה');
    expect(html).toContain('מה עוזר כרגע');
    expect(html).toContain('מה עדיין לוחץ');
    expect(html).toContain('מצב כולל היום');
    expect(html).toContain('ממתין לנתוני שוק');
    expect(html).toContain('ביטחון');
    expect(html).toContain('כיסוי');
    expect(html).toContain('חיובי');
    expect(html).toContain('מעורבים');
    expect(html).toContain('שלילי');
    expect(html).toContain('אשראי:');
    expect(html).toContain('אין נתון שנתי עדכני');
    expect(html).toContain('מדדי הליבה');
    expect(html).not.toContain('ששת מדדי הליבה');
    expect(html).toContain('אינפלציה שנתית ומדד המחירים לצרכן');
    expect(html).toContain('קצב השינוי במחירים ב־12 החודשים האחרונים');
    expect(html).toContain('רמת המדד שממנה מחשבים את האינפלציה');
    expect(html).toContain('כרגע חסר נתון שנתי עדכני, ולכן מוצג מדד המחירים אך לא קריאת אינפלציה שנתית מלאה.');
    expect(html).toContain('inflation-index-stat');
    expect(html).toContain('תרחיש בסיס');
    const forwardList = html.slice(html.indexOf('<ul class="phase1s-forward-list">'), html.indexOf('</ul>', html.indexOf('<ul class="phase1s-forward-list">')));
    expect(forwardList.match(/<li>/g)).toHaveLength(3);
    expect(forwardList).toContain('אם המצב נמשך:');
    expect(forwardList).toContain('שיפור אפשרי:');
    expect(forwardList).toContain('סיכון מרכזי:');
  });

  it('places the complete overall status before the today and forward narrative', () => {
    const html = renderToStaticMarkup(<App />);
    const statusStart = html.indexOf('class="phase1s-status-strip"');
    const todayStart = html.indexOf('id="regime-title"');
    const forwardStart = html.indexOf('class="phase1s-forward"');
    expect(statusStart).toBeGreaterThanOrEqual(0);
    expect(statusStart).toBeLessThan(todayStart);
    expect(todayStart).toBeLessThan(forwardStart);
    expect(html).toContain('ממתין לנתוני שוק');
    expect(html).toContain('חיובי');
    expect(html).toContain('מעורב');
    expect(html).toContain('שלילי');
    expect(html).toContain('ביטחון');
    expect(html).toContain('כיסוי');
    expect(html).toContain('אשראי:');
  });

  it('keeps hero status semantics in order and defines equal columns and aligned support/pressure lists', () => {
    const html = renderToStaticMarkup(<App />);
    const statusStart = html.indexOf('class="phase1s-status-strip"');
    const row = html.slice(statusStart, html.indexOf('<div class="phase1s-columns"', statusStart));
    const order = [
      row.indexOf('phase1s-status-label'), row.indexOf('phase1s-status-regime'),
      row.indexOf('phase1s-status-cell'), row.indexOf('phase1s-status-cell', row.indexOf('phase1s-status-cell') + 1),
      row.indexOf('phase1s-status-counts'), row.indexOf('phase1s-status-credit'),
    ];
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(row).toContain('מצב כולל היום');
    expect(row).toContain('כיסוי');
    expect(row).toContain('אשראי:');
    expect((html.match(/איפה אנחנו היום/g) ?? [])).toHaveLength(1);
    expect((html.match(/מבט קדימה/g) ?? [])).toHaveLength(1);
    expect(html).toContain('class="support-list"');
    expect(html).toContain('class="pressure-list"');
    const columns = html.indexOf('class="phase1s-columns"');
    const current = html.indexOf('class="phase1s-today"');
    const forward = html.indexOf('class="phase1s-forward"');
    expect(columns).toBeGreaterThanOrEqual(0);
    expect(columns).toBeLessThan(current);
    expect(current).toBeLessThan(forward);
    const columnsHtml = html.slice(columns, html.indexOf('</div>', forward));
    expect(columnsHtml.match(/<section class="phase1s-(today|forward)"/g)).toHaveLength(2);
    expect(html).toContain('class="phase1s-evidence-grid"');
  });

  it('uses clear USD/ILS wording and provides plain-language explanations for the global market series', () => {
    const html = renderToStaticMarkup(<App />);
    expect(seriesLabel('usd_ils')).toBe('דולר / שקל');
    expect(seriesLabel('us_10y_nominal')).toBe('תשואת אג״ח ארה״ב ל־10 שנים');
    expect(seriesLabel('us_10y_real')).toBe('תשואה ריאלית בארה״ב ל־10 שנים');
    expect(seriesLabel('us_2y_nominal')).toBe('תשואת אג״ח ארה״ב ל־2 שנים');
    expect(seriesLabel('us_10y_breakeven')).toBe('ציפיות אינפלציה ל־10 שנים בארה״ב');
    expect(seriesLabel('il_us_real_yield_differential')).toBe('פער תשואה ריאלית ישראל–ארה״ב');
    expect(html).toContain('שער חליפין ותנאי סיכון מקומיים');
    expect(html).not.toContain('שערי חליפין');
    expect(CONCEPT_EXPLANATIONS.usdIls.what).toBe('כמה שקלים נדרשים כדי לקנות דולר אחד.');
    expect(CONCEPT_EXPLANATIONS.usdIls.why).toBe('שינוי בשקל יכול להשפיע על מחירי יבוא, אינפלציה ותנאי הסיכון המקומיים.');
    expect(CONCEPT_EXPLANATIONS.usdIls.howToRead).toContain('מספר גבוה יותר בדרך כלל אומר שקל חלש יותר');
    expect((['usNominal10y', 'usReal10y', 'realYieldDifferential'] as const).every((key) => Boolean(CONCEPT_EXPLANATIONS[key].what))).toBe(true);
  });

  it('puts simple Hebrew drawer sections before collapsed source and calculation details', () => {
    const card: MacroCard = { key: 'cpi_inflation', title: 'אינפלציה', value: null, previousValue: null, change: null, unit: '%', status: 'unknown', explanation: 'אין נתון עדכני.', observedAt: null, source: 'הלמ״ס', sourceUrl: '#', history: [], pending: false, details: {} };
    const html = renderToStaticMarkup(<DetailDrawer card={card} signal={undefined} onClose={() => undefined} />);
    expect(html.indexOf('בשורה אחת')).toBeLessThan(html.indexOf('הנתון מאחורי הקלעים'));
    expect(html).toContain('למה זה חשוב');
    expect(html).toContain('איך לחשוב על זה');
    expect(html).toContain('<details class="drawer-technical">');
  });
});
