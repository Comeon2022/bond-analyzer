import { describe, expect, it } from 'vitest';
import { basisPointChange, directionSignal, inflationSignal, interpolateCurve, movingAverage, percentChange, weightedRegime } from './calculations';

describe('macro calculations', () => {
  it('calculates percent and basis-point changes', () => {
    expect(percentChange(105, 100)).toBe(5);
    expect(basisPointChange(2.75, 2.5)).toBeCloseTo(25);
    expect(percentChange(1, 0)).toBeNull();
  });

  it('interpolates a curve between source tenors and refuses extrapolation', () => {
    const points = [{ tenorYears: 2, yieldPercent: 2 }, { tenorYears: 10, yieldPercent: 4 }];
    expect(interpolateCurve(points, 6)).toBe(3);
    expect(interpolateCurve(points, 12)).toBeNull();
  });

  it('calculates moving averages only when the full window exists', () => {
    expect(movingAverage([1, 2, 3], 3)).toBe(2);
    expect(movingAverage([1, 2], 3)).toBeNull();
  });

  it('classifies inflation and yield changes with explicit thresholds', () => {
    expect(inflationSignal(2, 2.4)).toBe('green');
    expect(inflationSignal(3.2, 2.9)).toBe('red');
    expect(inflationSignal(null, null)).toBe('unknown');
    expect(directionSignal(-8, 5)).toBe('green');
    expect(directionSignal(1, 5)).toBe('yellow');
    expect(directionSignal(null, 5)).toBe('unknown');
  });

  it('renormalizes valid weighted inputs while reporting low signal coverage', () => {
    const regime = weightedRegime([{ status: 'green', weight: 0.25 }, { status: 'unknown', weight: 0.75 }]);
    expect(regime.score).toBe(1);
    expect(regime.coveragePct).toBe(25);
    expect(regime.status).toBe('green');
    expect(regime.counts.unknown).toBe(1);
    expect(regime.confidence).toBe('נמוכה');
  });
});
