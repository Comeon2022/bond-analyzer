import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App, { DetailDrawer } from '../App';
import ConceptExplainer, { ConceptExplanationDialog } from './ConceptExplainer';
import { CONCEPT_EXPLANATIONS } from '../lib/concepts';
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
    const terms = ['policyRate', 'inflation', 'cpiIndex', 'inflationExpectations', 'realYield', 'nominalYield', 'realYield10y', 'longYieldTrend', 'israelRiskProxy', 'corporateCreditSpreads', 'telBondShekeli', 'spread', 'basisPoints', 'yieldCurve', 'signalCoverage', 'confidence', 'duration', 'yieldToMaturity'] as const;
    for (const id of terms) {
      const item = CONCEPT_EXPLANATIONS[id];
      expect(item.title.length).toBeGreaterThan(2);
      expect(item.what.length).toBeGreaterThan(12);
      expect(item.why.length).toBeGreaterThan(12);
      expect(item.howToRead.length).toBeGreaterThan(12);
    }
  });

  it('shows today, forward and an explicit inflation state in the dashboard summary', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('איפה אנחנו היום?');
    expect(html).toContain('מבט קדימה');
    expect(html).toContain('מה עוזר כרגע לאג״ח');
    expect(html).toContain('מה עדיין לוחץ על השוק');
    expect(html).toContain('אינפלציה היום');
    expect(html).toContain('אין נתון שנתי עדכני');
    expect(html).toContain('תרחיש בסיס');
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
