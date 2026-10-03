import type { Signal, SignalStatus } from './types';

export interface OutlookSummary {
  overallLabel: string;
  currentState: string;
  baseCaseText: string;
  conclusionBullets: string[];
  riskTriggerBullets: string[];
  confidenceLabel: 'ביטחון נמוך' | 'ביטחון בינוני' | 'ביטחון גבוה יחסית';
  creditStatus: 'תומך' | 'מעורב' | 'זהיר' | 'לא זמין';
  creditDetail: string;
}

export interface CreditOutlookContext {
  available: boolean;
  stale: boolean;
  latestPeriod: string | null;
  seriesCount: number;
  largest3mWideningBp: number | null;
  largest3mNarrowingBp: number | null;
}

export const CREDIT_OUTLOOK_THRESHOLDS = {
  mildWideningBp: 10,
  materialWideningBp: 25,
  materialNarrowingBp: -25,
} as const;

export interface OutlookInput {
  regime: { status: SignalStatus; score: number | null; coveragePct: number };
  signals: Pick<Signal, 'key' | 'status'>[];
  creditContext?: CreditOutlookContext | null;
}

const FORBIDDEN_TEXT = /לקנות|למכור|בוודאות|בהכרח|בטוח/;

function labelForStatus(status: SignalStatus): string {
  return ({
    green: 'סביבה תומכת בירידת תשואות',
    yellow: 'סביבה מעורבת',
    red: 'סביבה תומכת בעליית תשואות',
    unknown: 'ממתין לנתוני שוק',
  } as const)[status];
}

function overallLabelFor(status: SignalStatus): string {
  return ({ green: 'סביבה חיובית מתונה', yellow: 'סביבה מעורבת', red: 'סביבה זהירה', unknown: 'אין עדיין תמונה מספקת' } as const)[status];
}

function countStatuses(signals: OutlookInput['signals'], keys: string[]) {
  const selected = keys.map((key) => signals.find((signal) => signal.key === key)?.status ?? 'unknown');
  return {
    green: selected.filter((status) => status === 'green').length,
    yellow: selected.filter((status) => status === 'yellow').length,
    red: selected.filter((status) => status === 'red').length,
    unknown: selected.filter((status) => status === 'unknown').length,
  };
}

function confidenceFor(input: OutlookInput): OutlookSummary['confidenceLabel'] {
  const known = input.signals.filter((signal) => signal.status !== 'unknown');
  const alignedShare = known.length ? Math.max(
    known.filter((signal) => signal.status === 'green').length,
    known.filter((signal) => signal.status === 'red').length,
  ) / known.length : 0;
  const realTrend = input.signals.find((signal) => signal.key === 'long_real_yield')?.status ?? 'unknown';
  const nominalTrend = input.signals.find((signal) => signal.key === 'long_yield_momentum')?.status ?? 'unknown';
  const longEndConflict = (realTrend === 'green' && nominalTrend === 'red') || (realTrend === 'red' && nominalTrend === 'green');
  if (input.regime.coveragePct >= 80 && alignedShare >= 0.65 && !longEndConflict) return 'ביטחון גבוה יחסית';
  if (input.regime.coveragePct >= 50 && !longEndConflict) return 'ביטחון בינוני';
  return 'ביטחון נמוך';
}

function longEndConclusion(real: SignalStatus, nominal: SignalStatus): string {
  if (real === 'unknown' && nominal === 'unknown') return 'אין כרגע די תצפיות מאומתות כדי להעריך את כיוון התשואות הארוכות.';
  if ((real === 'green' && nominal === 'red') || (real === 'red' && nominal === 'green')) return 'איתותי השינוי בתשואה הריאלית ובמגמה הנומינלית אינם אחידים, ולכן התמונה בקצה הארוך מעורבת.';
  if (real === 'green' || nominal === 'green') return 'לפחות אחד מאיתותי התשואות הארוכות מצביע על ירידה ביחס לתקופת ההשוואה הזמינה.';
  if (real === 'red' || nominal === 'red') return 'לפחות אחד מאיתותי התשואות הארוכות מצביע על עלייה ביחס לתקופת ההשוואה הזמינה.';
  if (real === 'yellow' || nominal === 'yellow') return 'השינויים שנמדדו בתשואות הארוכות מתונים או אינם חד־משמעיים בתקופת ההשוואה.';
  return 'הנתונים הזמינים בקצה הארוך אינם מצביעים על כיוון אחיד.';
}

function interpretCredit(context: CreditOutlookContext | null | undefined): { status: OutlookSummary['creditStatus']; detail: string; conclusion: string | null; trigger: string | null; materiallyWidening: boolean } {
  if (!context?.available || context.seriesCount <= 0) return { status: 'לא זמין', detail: 'אין כרגע נתוני אשראי זמינים.', conclusion: null, trigger: null, materiallyWidening: false };
  if (context.stale || !context.latestPeriod) return {
    status: 'לא זמין',
    detail: 'נתוני האשראי זמינים אך אינם עדכניים מספיק כדי להשפיע על התחזית הנוכחית.',
    conclusion: null,
    trigger: null,
    materiallyWidening: false,
  };

  const widening = context.largest3mWideningBp;
  const narrowing = context.largest3mNarrowingBp;
  const materiallyWidening = widening !== null && widening >= CREDIT_OUTLOOK_THRESHOLDS.materialWideningBp;
  if (materiallyWidening) return {
    status: 'זהיר',
    detail: `מבוסס על ${context.seriesCount} סדרות BOI, עד ${context.latestPeriod}`,
    conclusion: 'מרווחי האשראי מתרחבים ומוסיפים זהירות לתמונה הכוללת.',
    trigger: 'התרחבות מחודשת במרווחי האשראי.',
    materiallyWidening: true,
  };

  if (widening === null && narrowing === null) return {
    status: 'מעורב',
    detail: `מבוסס על ${context.seriesCount} סדרות BOI, עד ${context.latestPeriod}; אין שינוי תלת־חודשי מלא לכל הסדרות.`,
    conclusion: 'שוק האשראי מציג תמונה מעורבת: אין די השוואות תלת־חודשיות מלאות לקביעת כיוון רחב.',
    trigger: null,
    materiallyWidening: false,
  };

  const mildlyWidening = widening !== null && widening >= CREDIT_OUTLOOK_THRESHOLDS.mildWideningBp;
  const alsoNarrowing = narrowing !== null && narrowing <= CREDIT_OUTLOOK_THRESHOLDS.materialNarrowingBp;
  if (mildlyWidening || (alsoNarrowing && widening !== null && widening > 0)) return {
    status: 'מעורב',
    detail: `מבוסס על ${context.seriesCount} סדרות BOI, עד ${context.latestPeriod}`,
    conclusion: 'שוק האשראי מציג תמונה מעורבת: אין לחץ רוחבי, אך חלק מהמרווחים עדיין דורשים מעקב.',
    trigger: mildlyWidening ? 'התרחבות מחודשת במרווחי האשראי.' : null,
    materiallyWidening: false,
  };

  return {
    status: 'תומך',
    detail: `מבוסס על ${context.seriesCount} סדרות BOI, עד ${context.latestPeriod}`,
    conclusion: 'שוק האשראי אינו מצביע כרגע על החרפה רוחבית בתנאי המימון.',
    trigger: null,
    materiallyWidening: false,
  };
}

function lowerConfidence(label: OutlookSummary['confidenceLabel']): OutlookSummary['confidenceLabel'] {
  return label === 'ביטחון גבוה יחסית' ? 'ביטחון בינוני' : label === 'ביטחון בינוני' ? 'ביטחון נמוך' : 'ביטחון נמוך';
}

export function buildOutlookSummary(input: OutlookInput): OutlookSummary {
  const macroCounts = countStatuses(input.signals, ['policy_rate', 'cpi_inflation', 'inflation_expectations']);
  const realTrend = input.signals.find((signal) => signal.key === 'long_real_yield')?.status ?? 'unknown';
  const nominalTrend = input.signals.find((signal) => signal.key === 'long_yield_momentum')?.status ?? 'unknown';
  const risk = input.signals.find((signal) => signal.key === 'israel_risk_proxy')?.status ?? 'unknown';
  const credit = interpretCredit(input.creditContext);
  const currentState = input.regime.status === 'unknown'
    ? 'אין די איתותים מאומתים לקביעת תמונת מצב עדכנית.'
    : `סביבת שוק האג״ח כרגע ${input.regime.status === 'green' ? 'חיובית מתונה' : input.regime.status === 'yellow' ? 'מעורבת' : 'זהירה'}.`;

  const baseCaseText = input.regime.status === 'green'
    ? 'בתרחיש הבסיס בשבועות ובחודשים הקרובים, האיתותים עשויים להמשיך לתמוך בסביבה חיובית מתונה, אם מגמת האינפלציה והריבית תישאר דומה; התשואות הארוכות עדיין דורשות מעקב.'
    : input.regime.status === 'yellow'
      ? 'בתרחיש הבסיס בשבועות ובחודשים הקרובים, הסביבה נותרת מעורבת: הכוחות התומכים והמכבידים אינם אחידים, ולכן כיוון התשואות עשוי להישאר תלוי בנתונים הבאים.'
      : input.regime.status === 'red'
        ? 'בתרחיש הבסיס בשבועות ובחודשים הקרובים, הלחץ עשוי להימשך אם האינפלציה, התשואות הארוכות או תנאי הסיכון ימשיכו להכביד; שינוי באיתותים עשוי לשנות את התמונה.'
        : 'בתרחיש הבסיס אין די נתונים מאומתים כדי לגבש כיוון לשבועות ולחודשים הקרובים; התחזית תעודכן עם הצטברות איתותים.';

  const conclusionBullets = [
    `מבין איתותי הריבית והאינפלציה הזמינים: ${macroCounts.green} תומכים, ${macroCounts.yellow} מעורבים ו־${macroCounts.red} מכבידים; ${macroCounts.unknown} איתותים אינם זמינים.`,
    longEndConclusion(realTrend, nominalTrend),
    risk === 'green' ? 'פרוקסי תנאי הסיכון בישראל תומך יחסית, אך מבוסס על רכיבים זמינים ואינו מדד סחיר.'
      : risk === 'red' ? 'פרוקסי תנאי הסיכון בישראל מכביד בתקופה הנמדדת; הוא מבוסס על רכיבים זמינים ואינו מדד סחיר.'
        : risk === 'yellow' ? 'פרוקסי תנאי הסיכון בישראל נותר מעורב, לפי הרכיבים הזמינים.'
          : 'אין די רכיבי מקור מאומתים להערכת תנאי הסיכון בישראל.',
  ];
  if (input.creditContext && input.creditContext.seriesCount > 0) {
    if (credit.conclusion) conclusionBullets.push(credit.conclusion);
  }

  const riskTriggerBullets = [
    input.signals.find((signal) => signal.key === 'cpi_inflation')?.status === 'red' || input.signals.find((signal) => signal.key === 'inflation_expectations')?.status === 'red'
      ? 'המשך עלייה באינפלציה או בציפיות שכבר מסומנות כמכבידות.'
      : 'האצה מחודשת במדד המחירים או בציפיות האינפלציה.',
    realTrend === 'red' || nominalTrend === 'red'
      ? 'המשך עלייה בתשואות הארוכות בישראל; גם שינוי בתשואות בארצות הברית עשוי להשפיע על התמונה.'
      : 'שינוי כיוון ועלייה בתשואות הארוכות בישראל או בארצות הברית.',
    risk === 'red' ? 'המשך הרעה בפרוקסי תנאי הסיכון בישראל או היחלשות השקל.' : 'הרעה בפרוקסי תנאי הסיכון בישראל, לרבות היחלשות השקל.',
  ];
  if (credit.trigger) riskTriggerBullets.push(credit.trigger);

  let confidenceLabel = confidenceFor(input);
  if (input.regime.status === 'green' && !input.creditContext?.stale && credit.materiallyWidening) confidenceLabel = lowerConfidence(confidenceLabel);
  const text = [currentState, baseCaseText, ...conclusionBullets, ...riskTriggerBullets, overallLabelFor(input.regime.status), credit.detail];
  if (text.some((item) => FORBIDDEN_TEXT.test(item))) throw new Error('Outlook text contains prohibited recommendation or certainty language');
  return {
    overallLabel: overallLabelFor(input.regime.status),
    currentState,
    baseCaseText,
    conclusionBullets,
    riskTriggerBullets,
    confidenceLabel,
    creditStatus: credit.status,
    creditDetail: credit.detail,
  };
}

export function regimeLabel(status: SignalStatus): string {
  return labelForStatus(status);
}
