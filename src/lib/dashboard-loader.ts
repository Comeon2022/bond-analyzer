export function loadMacroAndCreditIndependently<Macro, Credit>(
  loadMacro: () => Promise<Macro>,
  loadCredit: () => Promise<Credit>,
  onCredit: (result: Credit | null) => void,
): { macro: Promise<Macro>; credit: Promise<void> } {
  const credit = Promise.resolve().then(loadCredit).then(
    (result) => { onCredit(result); },
    () => { onCredit(null); },
  );
  return { macro: loadMacro(), credit };
}
