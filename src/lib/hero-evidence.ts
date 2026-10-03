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
    helps.push(`האינפלציה השנתית ${percent(inflation.value)} בתוך היעד ויורדת; הלחץ לעליית ריבית מתמתן, דבר שעשוי לתמוך באג״ח.`);
  } else if (inflation?.status === 'yellow') {
    pressures.push('האינפלציה בתוך היעד, אך אינה יורדת בבירור; אין כרגע הקלה ברורה בלחץ הריבית.');
  } else if (inflation?.status === 'red' && inflation.value !== null) {
    pressures.push(`האינפלציה השנתית ${percent(inflation.value)} מכבידה ועלולה להשאיר לחץ לעליית ריבית ולתשואות האג״ח.`);
  }

  const policy = stateOf(signals, 'policy_rate');
  const policyCard = cards.find((card) => card.key === 'policy_rate');
  if (policy === 'green') {
    const level = percent(policyCard?.value);
    helps.push(`ריבית בנק ישראל ירדה${level ? ` וכעת היא ${level}` : ''}; אם הכיוון יימשך, הוא עשוי להפחית לחץ על התשואות.`);
  } else if (policy === 'red') {
    pressures.push('ריבית בנק ישראל עלתה; הדבר עשוי להעלות תשואות ולהכביד על מחירי אג״ח.');
  } else if (policy === 'yellow') {
    pressures.push('ריבית בנק ישראל כמעט לא השתנתה; אין ממנה איתות ברור להקלה בתשואות.');
  }

  const realYield = stateOf(signals, 'long_real_yield');
  const longTrend = stateOf(signals, 'long_yield_momentum');
  if (realYield === 'green' && longTrend !== 'red') {
    helps.push('התשואה הריאלית הארוכה ירדה; הדבר עשוי לתמוך במחירי אג״ח קיימות.');
  } else if (longTrend === 'green' && realYield === 'unknown') {
    helps.push('מגמת התשואות הארוכות מצביעה על ירידה שעשויה לתמוך במחירי אג״ח קיימות.');
  } else if (realYield === 'red' || longTrend === 'red') {
    pressures.push(realYield === 'red' && longTrend === 'red'
      ? 'התשואה הריאלית ומגמת התשואות הארוכות עלו; הדבר מכביד בדרך כלל על מחירי אג״ח קיימות.'
      : 'אחד מאותות התשואות הארוכות מצביע על עלייה שעשויה להכביד על מחירי אג״ח קיימות.');
  } else if (realYield === 'yellow' || longTrend === 'yellow' || (realYield !== 'unknown' && longTrend !== 'unknown')) {
    pressures.push('התשואות הארוכות יציבות או מאותתות בכיוונים שונים; אין מהן אישור ברור לתמיכה.');
  }

  const risk = stateOf(signals, 'israel_risk_proxy');
  if (risk === 'green') helps.push('פרוקסי הסיכון המקומי השתפר; הדבר מפחית חלק מהלחץ על אג״ח ישראליות.');
  else if (risk === 'red') pressures.push('פרוקסי הסיכון המקומי הורע; הדבר עשוי להכביד על אג״ח ישראליות.');
  else if (risk === 'yellow') pressures.push('פרוקסי הסיכון המקומי מעורב; אין ממנו איתות ברור להקלה בלחץ.');

  if (creditStatus === 'תומך') helps.push('בנתוני בנק ישראל אין התרחבות חריגה במרווחי האשראי; אין סימן ללחץ מימון רוחבי.');
  else if (creditStatus === 'זהיר') pressures.push('מרווחי האשראי התרחבו מהותית; תנאי המימון מכבידים יותר בחלק מהסדרות.');
  else if (creditStatus === 'מעורב') pressures.push('נתוני מרווחי האשראי אינם אחידים, ואינם מאשרים הקלה רחבה בתנאי המימון.');

  return { helps: helps.slice(0, 3), pressures: pressures.slice(0, 3) };
}
