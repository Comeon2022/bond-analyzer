import type { MacroCard, Signal, SignalStatus } from '../../shared/types';

export interface HeroEvidence {
  helps: string[];
  pressures: string[];
}

type HeroEvidenceInput = {
  signals: Pick<Signal, 'key' | 'status'>[];
  cards: Pick<MacroCard, 'key' | 'status' | 'value'>[];
  creditStatus: 'תומך' | 'מעורב' | 'זהיר' | 'לא זמין' | null;
};

const percent = (value: number | null | undefined): string | null => value == null || !Number.isFinite(value)
  ? null
  : `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 }).format(value)}%`;

function stateOf(signals: HeroEvidenceInput['signals'], key: string): SignalStatus {
  return signals.find((signal) => signal.key === key)?.status ?? 'unknown';
}

export function buildHeroEvidence({ signals, cards, creditStatus }: HeroEvidenceInput): HeroEvidence {
  const helps: string[] = [];
  const pressures: string[] = [];
  const inflation = cards.find((card) => card.key === 'cpi_inflation');
  if (inflation?.status === 'green' && inflation.value !== null) {
    helps.push(`האינפלציה השנתית ${percent(inflation.value)} ובמגמת ירידה בתוך היעד; זה מפחית את הלחץ לעליית ריבית ועשוי לתמוך באג״ח.`);
  } else if (inflation?.status === 'yellow') {
    pressures.push('האינפלציה בתוך היעד אך לא נרשמה ירידה ברורה; לכן עדיין אין ממנה תמיכה ברורה להפחתת לחץ הריבית.');
  } else if (inflation?.status === 'red' && inflation.value !== null) {
    pressures.push(`האינפלציה השנתית ${percent(inflation.value)} והאיתות מכביד; הדבר עלול להשאיר לחץ לעליית ריבית ולהכביד על אג״ח.`);
  }

  const policy = stateOf(signals, 'policy_rate');
  const policyCard = cards.find((card) => card.key === 'policy_rate');
  if (policy === 'green') {
    const level = percent(policyCard?.value);
    helps.push(`ריבית בנק ישראל ירדה לעומת תקופת ההשוואה${level ? ` וכעת היא ${level}` : ''}; אם הכיוון יימשך, הוא עשוי להפחית לחץ על תשואות בהמשך.`);
  } else if (policy === 'red') {
    pressures.push('ריבית בנק ישראל עלתה לעומת תקופת ההשוואה; הדבר עשוי להעלות את תשואות האג״ח ולהכביד על מחירן.');
  } else if (policy === 'yellow') {
    pressures.push('ריבית בנק ישראל כמעט לא השתנתה בתקופת ההשוואה; כרגע היא אינה מספקת איתות ברור להקלה בתשואות.');
  }

  const realYield = stateOf(signals, 'long_real_yield');
  const longTrend = stateOf(signals, 'long_yield_momentum');
  if (realYield === 'green' && longTrend !== 'red') {
    helps.push('התשואה הריאלית הארוכה ירדה בתקופת ההשוואה; ירידה כזו עשויה לתמוך במחירי אג״ח קיימות.');
  } else if (longTrend === 'green' && realYield === 'unknown') {
    helps.push('מגמת התשואות הארוכות מצביעה על ירידה בתקופת ההשוואה; ירידה כזו עשויה לתמוך במחירי אג״ח קיימות.');
  } else if (realYield === 'red' || longTrend === 'red') {
    pressures.push(realYield === 'red' && longTrend === 'red'
      ? 'התשואה הריאלית ומגמת התשואות הארוכות עלו בתקופות ההשוואה; עלייה בתשואות מכבידה בדרך כלל על מחירי אג״ח קיימות.'
      : 'אחד מאותות התשואות הארוכות מצביע על עלייה; עלייה כזו עשויה להכביד על מחירי אג״ח קיימות.');
  } else if (realYield === 'yellow' || longTrend === 'yellow' || (realYield !== 'unknown' && longTrend !== 'unknown')) {
    pressures.push('התשואות הארוכות יציבות או מאותתות בכיוונים שונים; לכן עדיין אין מהן אישור ברור לתמיכה במחירי אג״ח ארוכות.');
  }

  const risk = stateOf(signals, 'israel_risk_proxy');
  if (risk === 'green') helps.push('פרוקסי תנאי הסיכון המקומי השתפר לפי הרכיבים הזמינים; שיפור כזה מפחית חלק מהלחץ על אג״ח ישראליות.');
  else if (risk === 'red') pressures.push('פרוקסי תנאי הסיכון המקומי הורע לפי הרכיבים הזמינים; הרעה כזו עשויה להכביד על אג״ח ישראליות.');
  else if (risk === 'yellow') pressures.push('פרוקסי תנאי הסיכון המקומי מעורב; לכן הוא עדיין אינו מספק איתות ברור להקלה בלחץ.');

  if (creditStatus === 'תומך') helps.push('בנתוני האשראי המצרפיים של בנק ישראל אין כרגע התרחבות חריגה במרווחים; זה מפחית חשש ללחץ מימון רוחבי.');
  else if (creditStatus === 'זהיר') pressures.push('מרווחי האשראי המצרפיים התרחבו באופן מהותי; הדבר מצביע על תנאי מימון מכבידים יותר בחלק מהסדרות.');
  else if (creditStatus === 'מעורב') pressures.push('נתוני מרווחי האשראי אינם אחידים; לכן הם אינם מאשרים הקלה רחבה בתנאי המימון.');

  return { helps: helps.slice(0, 3), pressures: pressures.slice(0, 3) };
}
