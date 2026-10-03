import { describe, expect, it } from 'vitest';
import { buildHeroEvidence } from './hero-evidence';

describe('plain-language hero evidence', () => {
  it('names each current supportive condition and explains its bond-market implication', () => {
    const evidence = buildHeroEvidence({
      cards: [
        { key: 'cpi_inflation', status: 'green', value: 2.4 },
        { key: 'policy_rate', status: 'green', value: 4.5 },
      ],
      signals: [
        { key: 'policy_rate', status: 'green' },
        { key: 'long_real_yield', status: 'green' },
        { key: 'long_yield_momentum', status: 'green' },
      ],
      creditStatus: null,
    });
    expect(evidence.helps).toHaveLength(3);
    expect(evidence.helps[0]).toContain('האינפלציה השנתית 2.4%');
    expect(evidence.helps[0]).toContain('עשוי לתמוך באג״ח');
    expect(evidence.helps[1]).toContain('ריבית בנק ישראל ירדה');
    expect(evidence.helps[1]).toContain('עשוי להפחית לחץ');
    expect(evidence.helps[2]).toContain('התשואה הריאלית הארוכה ירדה');
    expect(evidence.helps[2]).toContain('עשוי לתמוך');
    expect(evidence.pressures).toHaveLength(0);
    expect(evidence.helps).toHaveLength(3);
    expect(evidence.helps.every((bullet) => bullet.trim().split(/\s+/).length <= 20)).toBe(true);
  });

  it('places observed pressure in the pressure list and never turns missing signals into evidence', () => {
    const evidence = buildHeroEvidence({
      cards: [{ key: 'cpi_inflation', status: 'unknown', value: null }],
      signals: [{ key: 'policy_rate', status: 'red' }, { key: 'israel_risk_proxy', status: 'red' }],
      creditStatus: 'זהיר',
    });
    expect(evidence.helps).toEqual([]);
    expect(evidence.pressures.join(' ')).toContain('ריבית בנק ישראל עלתה');
    expect(evidence.pressures.join(' ')).toContain('פרוקסי הסיכון המקומי הורע');
    expect(evidence.pressures.join(' ')).toContain('מרווחי האשראי התרחבו');
    expect(evidence.helps.length).toBeLessThanOrEqual(3);
    expect(evidence.pressures.length).toBeLessThanOrEqual(3);
    expect(evidence.pressures.join(' ')).not.toMatch(/לקנות|למכור|מומלץ|כדאי/);
  });
});
