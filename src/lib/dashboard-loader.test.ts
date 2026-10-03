import { describe, expect, it, vi } from 'vitest';
import { loadMacroAndCreditIndependently } from './dashboard-loader';

describe('independent macro and credit loading', () => {
  it('returns the macro overview while credit is pending, then degrades a credit failure to unavailable', async () => {
    let rejectCredit!: (reason: unknown) => void;
    const creditRequest = new Promise<{ seriesCount: number }>((_resolve, reject) => { rejectCredit = reject; });
    const onCredit = vi.fn();
    const tasks = loadMacroAndCreditIndependently(
      async () => ({ regime: 'macro remains available' }),
      () => creditRequest,
      onCredit,
    );

    await expect(tasks.macro).resolves.toEqual({ regime: 'macro remains available' });
    expect(onCredit).not.toHaveBeenCalled();
    rejectCredit(new Error('private network error'));
    await tasks.credit;
    expect(onCredit).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('keeps a successful credit response independent from a macro failure', async () => {
    const onCredit = vi.fn();
    const tasks = loadMacroAndCreditIndependently(
      async () => { throw new Error('macro failed'); },
      async () => ({ seriesCount: 3 }),
      onCredit,
    );
    await expect(tasks.macro).rejects.toThrow('macro failed');
    await tasks.credit;
    expect(onCredit).toHaveBeenCalledExactlyOnceWith({ seriesCount: 3 });
  });
});
