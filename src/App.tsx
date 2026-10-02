import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Scatter, ScatterChart,
} from 'recharts';
import type { MacroCard, OverviewResponse, SignalStatus, SourceStatus, YieldPoint } from '../shared/types';
import type { BondMarketRecord } from '../shared/bonds';
import { matchGovernmentBenchmark } from '../shared/bonds';
import { buildOutlookSummary, regimeLabel } from '../shared/outlook';
import { ApiError, apiGet, getApiHealth, getOverview } from './lib/api';
import type { BondBenchmarkResponse, BondDetailResponse, BondHistoryResponse } from './lib/api-types';
import CreditPanel from './CreditPanel';


const STATUS: Record<SignalStatus, { label: string; className: string }> = {
  green: { label: 'תומך בירידת תשואות', className: 'positive' },
  yellow: { label: 'מעורב', className: 'caution' },
  red: { label: 'תומך בעליית תשואות', className: 'negative' },
  unknown: { label: 'אין נתון מאומת', className: 'unknown' },
};

const SOURCE_STATUS: Record<SourceStatus['status'], string> = { ok: 'עודכן', stale: 'נתון ישן', error: 'שגיאת עדכון', pending: 'ממתין לנתונים' };
const REGIME_STATUS_HE: Record<SignalStatus, string> = { green: 'חיובי', yellow: 'מעורב', red: 'שלילי', unknown: 'אין נתון' };

function seriesLabel(key: string): string {
  const labels: Record<string, string> = {
    usd_ils: 'שער דולר / שקל',
    us_10y_nominal: 'תשואה נומינלית בארצות הברית ל־10 שנים',
    us_10y_real: 'תשואה ריאלית בארצות הברית ל־10 שנים',
    il_us_real_yield_differential: 'פער תשואות ריאליות · ישראל וארצות הברית',
    il_bei_1y: 'ציפיות אינפלציה לשנה',
    il_bei_5y: 'ציפיות אינפלציה לחמש שנים',
    il_bei_5y5y: 'ציפיות אינפלציה לחמש שנים בעוד חמש שנים',
    il_forecast_cpi_12m: 'תחזית אינפלציה ל־12 חודשים',
    usdIls20d: 'שינוי שער דולר / שקל ב־20 ימי מסחר',
    israelRealYieldChange: 'שינוי בתשואה הריאלית בישראל',
    realYieldDifferentialChange: 'שינוי בפער התשואות הריאליות',
  };
  return labels[key] ?? key;
}

function marketStatusLabel(status: SourceStatus['status']): string {
  return SOURCE_STATUS[status];
}

function changeLabel(key: string): string {
  const labels: Record<string, string> = {
    '1dPct': 'יום אחד', '5dBp': 'חמישה ימי מסחר', '20dPct': 'עשרים ימי מסחר', '60dPct': 'שישים ימי מסחר',
    '60dBp': 'שישים ימי מסחר', 'changeBps': 'שינוי', 'previousChange': 'לעומת התצפית הקודמת',
  };
  return labels[key] ?? key;
}

function marketUnitLabel(unit: string): string {
  return unit.replace('sessions', 'ימי מסחר').replace('source period', 'תקופת המקור').replace('comparable period', 'תקופת ההשוואה').replace('bp', 'נ״ב').replace('month', 'חודש');
}

function dateLabel(date: string | null | undefined): string {
  if (!date) return 'לא זמין';
  const value = new Date(date);
  if (Number.isNaN(value.valueOf())) return date;
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: date.includes('T') ? 'short' : undefined, timeZone: 'Asia/Jerusalem' }).format(value);
}

function numberLabel(value: number | null, digits = 2): string {
  return value === null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
}

function deltaLabel(card: MacroCard): { text: string; className: string } | null {
  if (card.change === null) return null;
  const isBasisPoints = card.key === 'policy_rate' || card.key === 'long_real_yield' || card.key === 'long_yield_momentum';
  const value = numberLabel(card.change, isBasisPoints ? 1 : 2);
  const text = card.key === 'policy_rate' ? `${card.change > 0 ? '+' : ''}${value} נ״ב מאז העדכון הקודם`
    : card.key === 'cpi_inflation' ? `${card.change > 0 ? '+' : ''}${value}% שינוי חודשי במדד`
      : `${card.change > 0 ? '+' : ''}${value} נ״ב לעומת תצפית קודמת`;
  return { text, className: card.change < 0 ? 'delta-down' : card.change > 0 ? 'delta-up' : 'delta-flat' };
}

function Sparkline({ data, status }: { data: MacroCard['history']; status: SignalStatus }) {
  if (data.length < 2) return <div className="sparkline-empty" aria-hidden="true"><span /></div>;
  const values = data.slice(-36).map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${25 - ((value - min) / range) * 22}`).join(' ');
  const color = status === 'green' ? '#17845d' : status === 'red' ? '#c25648' : status === 'yellow' ? '#c68a27' : '#9aa5b3';
  return <svg className="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" aria-label="מגמת נתונים היסטורית"><polyline points={points} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" /></svg>;
}

function SourceDot({ status }: { status: SourceStatus['status'] }) {
  return <span className={`source-dot source-${status}`} aria-hidden="true" />;
}

function MacroCardView({ card, onOpen }: { card: MacroCard; onOpen: (card: MacroCard) => void }) {
  const status = STATUS[card.status];
  const delta = deltaLabel(card);
  const mainValue = card.key === 'long_yield_momentum' ? card.value === null ? '—' : `${numberLabel(card.value, 1)} נ״ב`
    : card.value === null ? '—' : `${numberLabel(card.value)}${card.unit ? ` ${card.unit}` : ''}`;
  const sourceAvailable = card.sourceUrl !== '#';
  return (
    <button className={`signal-card ${status.className} ${card.pending ? 'pending' : ''}`} onClick={() => onOpen(card)} aria-label={`פרטים: ${card.title}`}>
      <div className="card-topline"><span className="card-category">{card.pending ? 'בשלב הבא' : card.key === 'cpi_inflation' ? 'מחירים' : card.key === 'policy_rate' ? 'מדיניות מוניטרית' : 'עקום ממשלתי'}</span><span className={`status-pill ${status.className}`}><SourceDot status={card.pending ? 'pending' : card.status === 'unknown' ? 'pending' : 'ok'} />{status.label}</span></div>
      <div className="card-title">{card.title}<span className="arrow" aria-hidden="true">↗</span></div>
      <div className={`metric-value ${card.value === null ? 'no-value' : ''}`}>{mainValue}</div>
      {card.key === 'cpi_inflation' && <div className="metric-caption">שינוי ב-12 החודשים האחרונים</div>}
      {card.key === 'long_yield_momentum' && <div className="metric-caption">תנועה בתקופת מקור של כחודש</div>}
      {delta && <div className={`metric-delta ${delta.className}`}>{delta.text}</div>}
      {!delta && card.pending && <div className="metric-delta">מקור רשמי טרם חובר</div>}
      <div className="sparkline-wrap"><Sparkline data={card.history} status={card.status} /></div>
      <div className="card-explanation">{card.explanation}</div>
      <div className="card-footer"><span>{sourceAvailable ? card.source : 'מקור בתהליך'}</span><span>{dateLabel(card.observedAt)}</span></div>
    </button>
  );
}

function makeCurveChart(real: YieldPoint[], nominal: YieldPoint[]) {
  const dates = [...new Set([...real.map((point) => point.date), ...nominal.map((point) => point.date)])].sort();
  const targetDates = dates.length ? [dates.at(-1)!, dates.filter((date) => date <= shiftDate(dates.at(-1)!, -30)).at(-1), dates.filter((date) => date <= shiftDate(dates.at(-1)!, -365)).at(-1)].filter((date): date is string => Boolean(date)) : [];
  const selected = [...new Set(targetDates)];
  const latestDate = selected[0];
  const previousDate = selected[1];
  const yearDate = selected[2];
  const latestReal = real.filter((point) => point.date === latestDate);
  const latestNominal = nominal.filter((point) => point.date === latestDate);
  const previousReal = previousDate ? real.filter((point) => point.date === previousDate) : [];
  const previousNominal = previousDate ? nominal.filter((point) => point.date === previousDate) : [];
  const yearReal = yearDate ? real.filter((point) => point.date === yearDate) : [];
  const yearNominal = yearDate ? nominal.filter((point) => point.date === yearDate) : [];
  const tenors = [...new Set([...latestReal, ...latestNominal].map((point) => point.tenorYears))].sort((a, b) => a - b);
  const values = tenors.map((tenor) => ({
    tenor: `${tenor}Y`,
    tenorYears: tenor,
    real: latestReal.find((point) => point.tenorYears === tenor)?.value ?? null,
    nominal: latestNominal.find((point) => point.tenorYears === tenor)?.value ?? null,
    realMonth: previousReal.find((point) => point.tenorYears === tenor)?.value ?? null,
    nominalMonth: previousNominal.find((point) => point.tenorYears === tenor)?.value ?? null,
    realYear: yearReal.find((point) => point.tenorYears === tenor)?.value ?? null,
    nominalYear: yearNominal.find((point) => point.tenorYears === tenor)?.value ?? null,
  }));
  return { values, latestDate, previousDate, yearDate };
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function DetailDrawer({ card, signal, onClose }: { card: MacroCard; signal: OverviewResponse['signals'][number] | undefined; onClose: () => void }) {
  const state = STATUS[card.status];
  const rules: Record<string, string[]> = {
    policy_rate: ['ירוק: ירידה בריבית לעומת התצפית הזמינה מלפני כ-20 תצפיות.', 'צהוב: שינוי קטן או יציבות.', 'אדום: עלייה בריבית לעומת תצפית ההשוואה.', 'הריבית הקצרה משפיעה אך אינה קובעת מכנית תשואות ארוכות.'],
    cpi_inflation: ['ירוק: אינפלציה שנתית בתוך היעד ובמגמת ירידה.', 'צהוב: בתוך היעד ללא מגמת ירידה ברורה.', 'אדום: מעל היעד או עלייה משמעותית.', 'החישוב מבוסס על רמות המדד החודשי של הלמ״ס.'],
    inflation_expectations: ['מקור סדרת ציפיות רשמי ייבדק ויחובר בשלב הבא.', 'לא מוצג נתון חלופי או אומדן לא מאומת.'],
    israel_risk_proxy: ['מקור CDS או פרוקסי סיכון שוק ייבדק ויחובר בשלב הבא.', 'לא מוצג נתון CDS מומצא.'],
    long_real_yield: ['ירוק: ירידה מול התצפית הרשמית הזמינה מלפני כחודש.', 'צהוב: שינוי בטווח של 5 נ״ב.', 'אדום: עלייה מול התצפית הרשמית הזמינה מלפני כחודש.', 'רמת התשואה ומגמתה מוצגות בנפרד.'],
    long_yield_momentum: ['העקום הרשמי מתפרסם כממוצעים חצי-חודשיים.', 'סדרות 5/20/60 ימי מסחר וממוצעים נעים יומיים אינן מחושבות מהתדירות הזמינה.'],
  };
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button className="close-button" onClick={onClose} aria-label="סגירה">×</button>
      <div className="eyebrow">פירוט מקור וכלל</div>
      <h2 id="detail-title">{card.title}</h2>
      <div className="drawer-value">{card.value === null ? 'אין נתון' : `${numberLabel(card.value)}${card.unit ? ` ${card.unit}` : ''}`}</div>
      <span className={`status-pill ${state.className}`}><SourceDot status={card.status === 'unknown' ? 'pending' : 'ok'} />{state.label}</span>
      <p className="drawer-explanation">{card.explanation}</p>
      <div className="drawer-section"><h3>כלל הסיווג</h3><ul>{(rules[card.key] ?? []).map((rule) => <li key={rule}>{rule}</li>)}</ul></div>
      {signal && <div className="drawer-section"><h3>ערכי החישוב</h3><dl className="details-grid">{Object.entries(signal.value).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'number' ? numberLabel(value, 3) : value ?? '—'}</dd></div>)}</dl></div>}
      <div className="drawer-section provenance"><h3>מקור ותזמון</h3><p>{card.source}</p><p>תאריך תצפית: {dateLabel(card.observedAt)}</p><p>קליטה אחרונה: {dateLabel(typeof card.details.sourceFetchedAt === 'string' ? card.details.sourceFetchedAt : null)}</p>{card.sourceUrl !== '#' && <a href={card.sourceUrl} target="_blank" rel="noreferrer">פתיחת המקור הרשמי ↗</a>}</div>
    </section>
  </div>;
}

function YieldCurvePanel({ real, nominal }: { real: YieldPoint[]; nominal: YieldPoint[] }) {
  const curve = useMemo(() => makeCurveChart(real, nominal), [real, nominal]);
  if (!curve.values.length) return <section className="panel chart-panel"><div className="panel-title"><div><span className="eyebrow">עקום ממשלתי</span><h2>תשואה לפי טווח לפדיון</h2></div><span className="source-empty">ממתין לעדכון מקור רשמי</span></div><EmptyChart /></section>;
  return <section className="panel chart-panel">
    <div className="panel-title"><div><span className="eyebrow">עקום ממשלתי</span><h2>תשואה לפי טווח לפדיון</h2><p>עקום אפס של בנק ישראל · ממוצעים המתפרסמים בקובץ המקור</p></div><div className="chart-date">תצפית אחרונה <b>{dateLabel(curve.latestDate)}</b></div></div>
    <div className="chart-legend"><span><i className="legend-line nominal" />נומינלית</span><span><i className="legend-line real" />ריאלית</span>{curve.previousDate && <span><i className="legend-line previous" />תצפית קודמת זמינה</span>}</div>
    <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={curve.values} margin={{ top: 12, right: 8, left: 4, bottom: 4 }}>
      <CartesianGrid stroke="#e8edf2" vertical={false} />
      <XAxis dataKey="tenor" axisLine={false} tickLine={false} tick={{ fill: '#738091', fontSize: 12 }} />
      <YAxis orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#738091', fontSize: 12 }} tickFormatter={(value: number) => `${value}%`} width={52} domain={['auto', 'auto']} />
      <Tooltip formatter={(value: number | string) => [`${numberLabel(Number(value), 3)}%`, '']} labelFormatter={(label) => `טווח לפדיון: ${label}`} contentStyle={{ border: '1px solid #e5eaf0', borderRadius: 8, direction: 'rtl', fontFamily: 'inherit' }} />
      <Line type="monotone" dataKey="nominal" name="נומינלית · עדכני" stroke="#173c65" strokeWidth={2.7} dot={{ r: 3 }} connectNulls />
      <Line type="monotone" dataKey="real" name="ריאלית · עדכני" stroke="#137c69" strokeWidth={2.7} dot={{ r: 3 }} connectNulls />
      {curve.previousDate && <Line type="monotone" dataKey="nominalMonth" name={`נומינלית · ${dateLabel(curve.previousDate)}`} stroke="#173c65" strokeOpacity={0.4} strokeDasharray="5 5" dot={false} connectNulls />}
      {curve.previousDate && <Line type="monotone" dataKey="realMonth" name={`ריאלית · ${dateLabel(curve.previousDate)}`} stroke="#137c69" strokeOpacity={0.4} strokeDasharray="5 5" dot={false} connectNulls />}
      {curve.yearDate && <Line type="monotone" dataKey="nominalYear" name={`נומינלית · ${dateLabel(curve.yearDate)}`} stroke="#173c65" strokeOpacity={0.2} strokeDasharray="2 4" dot={false} connectNulls />}
      {curve.yearDate && <Line type="monotone" dataKey="realYear" name={`ריאלית · ${dateLabel(curve.yearDate)}`} stroke="#137c69" strokeOpacity={0.2} strokeDasharray="2 4" dot={false} connectNulls />}
      <Legend wrapperStyle={{ display: 'none' }} />
    </LineChart></ResponsiveContainer></div>
    <div className="chart-source"><span>המקור מפרסם תצפיות לפי לוח שנה ולפי מדד המחירים, בקירוב פעמיים בחודש.</span><span>ריבית נומינלית אינה תחזית לתשואה בפועל.</span></div>
  </section>;
}

function EmptyChart() { return <div className="empty-chart"><div className="empty-chart-icon">⌁</div><p>אין עדיין תצפיות שמורות</p><span>העדכון המתוזמן ימשוך נתונים ממקור רשמי וישמור היסטוריה.</span></div>; }

function InflationPanel({ data }: { data: OverviewResponse['inflation'] }) {
  const chartData = data.observations.slice(-36).map((point) => ({ date: point.observationDate.slice(0, 7), index: point.value }));
  return <section className="panel inflation-panel">
    <div className="panel-title"><div><span className="eyebrow">נתוני מחירים · הלמ״ס</span><h2>מדד המחירים לצרכן</h2><p>רמת המדד והאינפלציה המחושבת ממנה</p></div><a className="source-link" href="https://www.cbs.gov.il/en/cbsNewBrand/Pages/Api-Indices.aspx" target="_blank" rel="noreferrer">תיעוד API ↗</a></div>
    <div className="inflation-stats">
      <div className="inflation-stat"><span>אינפלציה שנתית</span><b>{data.yoy === null ? '—' : `${numberLabel(data.yoy)}%`}</b><small>לפי 12 חודשי מדד</small></div>
      <div className="inflation-stat"><span>שינוי חודשי</span><b>{data.mom === null ? '—' : `${data.mom > 0 ? '+' : ''}${numberLabel(data.mom)}%`}</b><small>לעומת החודש הקודם</small></div>
      <div className="inflation-stat"><span>יעד בנק ישראל</span><b>{data.targetLow}–{data.targetHigh}%</b><small>טווח יעד שנתי</small></div>
      <div className="inflation-stat"><span>חודש מדד אחרון</span><b>{data.observationDate ? dateLabel(data.observationDate) : '—'}</b><small>ללא השלמה לנתון יומי</small></div>
    </div>
    <div className="mini-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}><CartesianGrid stroke="#e8edf2" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#8290a0', fontSize: 10 }} minTickGap={34} /><YAxis orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#8290a0', fontSize: 10 }} width={48} domain={['auto', 'auto']} /><Tooltip formatter={(value: number | string) => [numberLabel(Number(value), 3), 'מדד']} contentStyle={{ borderRadius: 8, direction: 'rtl', fontFamily: 'inherit' }} /><Line type="monotone" dataKey="index" name="רמת המדד" stroke="#c18735" strokeWidth={2.2} dot={false} /></LineChart></ResponsiveContainer>{chartData.length < 2 && <div className="chart-overlay">היסטוריית המדד תופיע לאחר קליטת נתוני הלמ״ס</div>}</div>
    <div className="chart-source"><span>הערכים המקוריים שנשמרים: רמת המדד והחודש שאליו היא מתייחסת.</span><span>נכון ל-{dateLabel(data.observationDate)}</span></div>
  </section>;
}

function SourceStatusPanel({ sources }: { sources: SourceStatus[] }) {
  return <section className="panel sources-panel"><div className="panel-title"><div><span className="eyebrow">שקיפות נתונים</span><h2>מקורות ועדכונים</h2></div><span className="source-count">{sources.filter((source) => source.status === 'ok').length} מקורות תקינים</span></div>
    <div className="source-list">{sources.map((source) => <a className="source-row" href={source.url} key={source.key} target="_blank" rel="noreferrer"><div className="source-main"><SourceDot status={source.status} /><span>{source.name}</span><small>{SOURCE_STATUS[source.status]}</small></div><div className="source-meta"><span>{source.observationDate ? `תצפית ${dateLabel(source.observationDate)}` : source.lastError ?? 'טרם נקלטו נתונים'}</span><span>{source.lastSuccessAt ? `נבדק ${dateLabel(source.lastSuccessAt)}` : ''}</span></div></a>)}</div>
    <p className="source-policy">בעת שגיאת מקור נשמרת התצפית התקינה האחרונה, והאות מוצג כלא זמין כשהנתון עובר את סף ההתיישנות.</p>
  </section>;
}

function RegimeHistoryChart({rows}:{rows:OverviewResponse['regimeHistory']}) {
  const ordered=[...rows].reverse();
  const points=(metric:'score'|'coveragePct')=>ordered.map((row,index)=>`${ordered.length<2?300:index/(ordered.length-1)*590+5},${metric==='score'?80-((row.score ?? 0)+1)*35:80-row.coveragePct*.7}`).join(' ');
  return <svg viewBox="0 0 600 90" role="img" aria-label="היסטוריית מדד הסביבה ושלמות הנתונים" style={{width:'100%',height:120}}><polyline points={points('score')} fill="none" stroke="#137c69" strokeWidth="2"/><polyline points={points('coveragePct')} fill="none" stroke="#c18735" strokeWidth="2"/><text x="590" y="12" textAnchor="end" fill="#137c69">מדד</text><text x="590" y="27" textAnchor="end" fill="#c18735">שלמות נתונים</text></svg>;
}

function BondDetailDrawer({ bond, onClose }: { bond: BondMarketRecord; onClose: () => void }) {
  const [period, setPeriod] = useState('MAX');
  const [history, setHistory] = useState<BondHistoryResponse['observations']>([]);
  const [spreads, setSpreads] = useState<BondBenchmarkResponse['observations']>([]);
  const [cashflows, setCashflows] = useState<BondDetailResponse['cashflows']>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setDetailLoading(true);
    void Promise.all([
      apiGet<BondHistoryResponse>(`/api/bonds/${encodeURIComponent(bond.id)}/history`),
      apiGet<BondBenchmarkResponse>(`/api/bonds/${encodeURIComponent(bond.id)}/benchmark`),
      apiGet<BondDetailResponse>(`/api/bonds/${encodeURIComponent(bond.id)}`),
    ]).then(([historyResponse, benchmarkResponse, detailResponse]) => {
      if (!active) return;
      setHistory(historyResponse.observations);
      setSpreads(benchmarkResponse.observations);
      setCashflows(detailResponse.cashflows);
      setDetailError(null);
    }).catch((cause: unknown) => {
      if (active) setDetailError(cause instanceof Error ? cause.message : 'לא ניתן לטעון את פרטי איגרת החוב.');
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => { active = false; };
  }, [bond.id]);

  const cutoff = new Date();
  if (period === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
  else if (period === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
  else if (period === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
  else if (period === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
  const visible = history
    .filter((row) => period === 'MAX' || new Date(row.observationDate) >= cutoff)
    .map((row) => ({ ...row, spreadBp: spreads.find((item) => item.observation_date === row.observationDate)?.spread_bp ?? null }));
  const fields: Array<{ label: string; value: string | number | null }> = [
    { label: 'מזהה נייר', value: bond.securityId }, { label: 'סוג הצמדה', value: bond.linkageType },
    { label: 'שיעור קופון', value: bond.couponRate }, { label: 'מועד פירעון', value: bond.maturityDate },
    { label: 'מחיר נקי', value: bond.cleanPrice }, { label: 'מחיר מלא', value: bond.dirtyPrice },
    { label: 'תשואה לפדיון', value: bond.ytm }, { label: 'מח״מ', value: bond.duration },
    { label: 'יתרה במחזור', value: bond.outstandingAmount }, { label: 'מועד מסחר אחרון', value: bond.lastTradeAt },
    { label: 'דירוג / חברת דירוג', value: bond.rating ? `${bond.rating} / ${bond.ratingAgency ?? 'לא ידוע'}` : null },
    { label: 'מועד דירוג', value: bond.ratingDate }, { label: 'בטוחות', value: bond.collateralSummary },
  ];
  const notAvailable = 'לא זמין';

  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="detail-drawer" role="dialog" aria-modal="true" aria-label="פרטי איגרת חוב">
      <button className="close-button" onClick={onClose} aria-label="סגירה">×</button>
      <h2>{bond.issuerNameHe} · סדרה {bond.seriesName}</h2>
      {detailLoading && <p role="status">טוען נתונים…</p>}
      {detailError && <div className="error-banner" role="alert"><div><b>לא ניתן לטעון את נתוני האיגרת</b><p>{detailError}</p></div></div>}
      <h3>נתוני האיגרת</h3>
      <dl className="details-grid">{fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value ?? notAvailable}</dd></div>)}</dl>
      <h3>השוואה יחסית</h3>
      <p>תשואת ממשלה מקבילה: {bond.benchmarkYield ?? notAvailable}{bond.benchmarkYield === null ? '' : '%'} · איכות התאמה: {bond.benchmarkQuality} · מרווח: {bond.spreadBp ?? notAvailable}{bond.spreadBp === null ? '' : ' נ״ב'} · מרווח למח״מ: {bond.spreadPerDuration ?? notAvailable}{bond.spreadPerDuration === null ? '' : ' נ״ב לשנה'}</p>
      <p>מרווח למח״מ הוא מדד השוואתי לא תקני; הוא אינו OAS, Z-spread או מדד אשראי תקני.</p>
      <h3>היסטוריית מסחר</h3>
      <div className="bond-filters">{['1M', '3M', '6M', '1Y', 'MAX'].map((window) => <button key={window} onClick={() => setPeriod(window)} aria-pressed={period === window}>{window}</button>)}</div>
      {visible.length > 0 && <ResponsiveContainer width="100%" height={200}><LineChart data={visible}><CartesianGrid stroke="#e8edf2"/><XAxis dataKey="observationDate"/><YAxis yAxisId="price"/><YAxis yAxisId="yield" orientation="right"/><Tooltip/><Legend/><Line yAxisId="price" dataKey="cleanPrice" name="מחיר נקי" stroke="#386f91" dot={false}/><Line yAxisId="yield" dataKey={bond.linkageType === 'cpi' ? 'realYtm' : 'nominalYtm'} name="תשואה לפדיון" stroke="#987d54" dot={false}/><Line yAxisId="yield" dataKey="spreadBp" name="מרווח (נ״ב)" stroke="#536f59" dot={false}/></LineChart></ResponsiveContainer>}
      {!detailLoading && !detailError && visible.length === 0 && <p>אין היסטוריית מסחר זמינה ממקור מורשה לתקופה זו.</p>}
      <h3>לוח תשלומי ריבית וקרן</h3>
      {cashflows.length > 0 ? cashflows.map((flow, index) => <p key={`${flow.paymentDate}-${index}`}>{flow.paymentDate} · ריבית {flow.couponAmount ?? notAvailable} · שיעור פירעון קרן {flow.principalPercentage ?? notAvailable}%</p>) : <p>אין לוח תשלומים מאומת ממקור נתונים.</p>}
      <h3>סיכוני נתונים ומקור</h3>
      <p>{bond.collateralSummary ?? 'לא נמסר מידע על בטוחות'} · מצב הציטוט: {bond.stale ? 'מיושן' : 'עדכני'} · מקור: {bond.sourceUrl ?? 'ממתין למקור מורשה'} · תאריך תצפית: {bond.observationDate ?? notAvailable}</p>
    </section>
  </div>;
}
function BondScreener({ data, governmentCurves }: { data: OverviewResponse['bondScreener']; governmentCurves: OverviewResponse['curves'] }) {
  const [issuer, setIssuer] = useState('');
  const [linkage, setLinkage] = useState<'cpi' | 'nominal'>('cpi');
  const [rating, setRating] = useState('');
  const [minMaturity, setMinMaturity] = useState('');
  const [maxMaturity, setMaxMaturity] = useState('');
  const [minDuration, setMinDuration] = useState('');
  const [maxDuration, setMaxDuration] = useState('');
  const [minVolume, setMinVolume] = useState('');
  const [hideStale, setHideStale] = useState(false);
  const [sort, setSort] = useState<keyof BondMarketRecord>('seriesName');
  const [selected, setSelected] = useState<BondMarketRecord | null>(null);
  const visible = useMemo(() => data.rows.filter((row) =>
    (!issuer || row.issuerKey === issuer)
    && row.linkageType === linkage
    && (!rating || row.rating === rating)
    && (!minMaturity || (row.maturityDate ?? '') >= minMaturity)
    && (!maxMaturity || (row.maturityDate ?? '') <= maxMaturity)
    && (minDuration === '' || (row.duration ?? -1) >= Number(minDuration))
    && (maxDuration === '' || (row.duration ?? Infinity) <= Number(maxDuration))
    && (minVolume === '' || (row.tradingVolume ?? -1) >= Number(minVolume))
    && (!hideStale || !row.stale)
  ).sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), undefined, { numeric: true })),
  [data.rows, issuer, linkage, rating, minDuration, maxDuration, minVolume, hideStale, sort, minMaturity, maxMaturity]);
  const chartRows = visible.filter((row) => row.duration !== null && row.ytm !== null);
  const medianFresh = (select: (row: BondMarketRecord) => number | null) => {
    const values = visible.filter((row) => !row.stale).map(select).filter((value): value is number => value !== null);
    return values.length >= 3 ? median(values) : null;
  };
  const curves = {
    cpi: governmentCurves.real.map((point) => ({ tenorYears: point.tenorYears, yieldPercent: point.value })),
    nominal: governmentCurves.nominal.map((point) => ({ tenorYears: point.tenorYears, yieldPercent: point.value })),
  };
  const gov5 = matchGovernmentBenchmark(linkage, 5, null, curves).yieldPercent;
  const gov10 = matchGovernmentBenchmark(linkage, 10, null, curves).yieldPercent;
  const infra5 = visible.filter((row) => !row.stale && row.duration !== null && row.duration >= 4 && row.duration <= 6 && row.ytm !== null).map((row) => row.ytm!);
  const infra10 = visible.filter((row) => !row.stale && row.duration !== null && row.duration >= 9 && row.duration <= 11 && row.ytm !== null).map((row) => row.ytm!);
  const money = (value: number | null, digits = 2) => value === null ? 'לא זמין' : numberLabel(value, digits);
  const columns: Array<{ label: string; sort: keyof BondMarketRecord; help?: string }> = [
    { label: 'מנפיק', sort: 'issuerNameHe' }, { label: 'סדרה', sort: 'seriesName' },
    { label: 'הצמדה', sort: 'linkageType' }, { label: 'קופון', sort: 'couponRate', help: 'הקופון הוא הריבית החוזית של האיגרת; התשואה לפדיון מושפעת גם ממחיר השוק.' },
    { label: 'תשואה לפדיון', sort: 'ytm' }, { label: 'מח״מ', sort: 'duration' },
    { label: 'אג״ח ממשלתית מקבילה', sort: 'benchmarkQuality' }, { label: 'תשואת ממשלה', sort: 'benchmarkYield' },
    { label: 'מרווח (נ״ב)', sort: 'spreadBp' }, { label: 'שינוי יומי (נ״ב)', sort: 'spreadChange1dBp' },
    { label: 'שינוי שבועי (נ״ב)', sort: 'spreadChange5dBp' }, { label: 'מרווח למח״מ', sort: 'spreadPerDuration', help: 'מדד השוואתי לא תקני; אינו OAS או Z-spread.' },
    { label: 'מחזור מסחר', sort: 'tradingVolume' }, { label: 'מועד תצפית וגיל ציטוט', sort: 'observationDate' },
  ];

  return <section className="panel bond-screener" dir="rtl">
    <div className="panel-title"><div><span className="eyebrow">שלב 1ג · השוואת ערך יחסי</span><h2>איגרות חוב לתשתיות — השוואת ערך יחסי</h2><p>הקופון והתשואה לפדיון מוצגים בנפרד. מרווח למח״מ הוא מדד השוואתי לא תקני, ולא מדד OAS או Z-spread.</p></div><a className="source-link" href={data.sourceUrl} target="_blank" rel="noreferrer">פרטי מקור ורישוי</a></div>
    <div className="error-banner"><div><b>{data.sourceStatus === 'pending' ? 'מקור נתוני האג״ח ממתין לרישוי' : 'מקור נתוני האג״ח הוגדר'}</b><p>{data.blocker}</p></div></div>
    <div className="inflation-stats">
      <div className="inflation-stat"><span>איגרות תשתית צמודות מדד עם נתון עדכני</span><b>{visible.filter((row) => row.linkageType === 'cpi' && !row.stale).length}</b></div>
      <div className="inflation-stat"><span>חציון תשואה ריאלית</span><b>{visible.filter((row) => row.linkageType === 'cpi' && !row.stale && row.ytm !== null).length >= 3 ? money(median(visible.filter((row) => row.linkageType === 'cpi' && !row.stale && row.ytm !== null).map((row) => row.ytm!))) : 'לא זמין'}</b></div>
      <div className="inflation-stat"><span>חציון מח״מ</span><b>{visible.filter((row) => row.linkageType === 'cpi' && !row.stale && row.duration !== null).length >= 3 ? money(median(visible.filter((row) => row.linkageType === 'cpi' && !row.stale && row.duration !== null).map((row) => row.duration!))) : 'לא זמין'}</b></div>
      <div className="inflation-stat"><span>חציון מרווח</span><b>{visible.filter((row) => row.linkageType === 'cpi' && !row.stale && row.spreadBp !== null).length >= 3 ? `${money(median(visible.filter((row) => row.linkageType === 'cpi' && !row.stale && row.spreadBp !== null).map((row) => row.spreadBp!)))} נ״ב` : 'לא זמין'}</b></div>
      <div className="inflation-stat"><span>חציון שינוי מרווח בחמישה ימי מסחר</span><b>{medianFresh((row) => row.spreadChange5dBp) === null ? 'לא זמין' : `${money(medianFresh((row) => row.spreadChange5dBp), 1)} נ״ב`}</b></div>
      <div className="inflation-stat"><span>ממשלה / תשתיות · סביב חמש שנים</span><b>{money(gov5)}% / {infra5.length >= 3 ? `${money(median(infra5))}%` : 'לא זמין'}</b></div>
      <div className="inflation-stat"><span>ממשלה / תשתיות · סביב עשר שנים</span><b>{money(gov10)}% / {infra10.length >= 3 ? `${money(median(infra10))}%` : 'לא זמין'}</b></div>
    </div>
    <div className="bond-filters">
      <label>מנפיק<select value={issuer} onChange={(event) => setIssuer(event.target.value)}><option value="">כל המנפיקים</option>{data.issuers.map((item) => <option key={item.issuerKey} value={item.issuerKey}>{item.issuerNameHe}</option>)}</select></label>
      <label>הצמדה<select value={linkage} onChange={(event) => setLinkage(event.target.value as 'cpi' | 'nominal')}><option value="cpi">צמוד מדד</option><option value="nominal">שקלי נומינלי</option></select></label>
      <label>פירעון החל מתאריך<input type="date" value={minMaturity} onChange={(event) => setMinMaturity(event.target.value)}/></label>
      <label>פירעון עד תאריך<input type="date" value={maxMaturity} onChange={(event) => setMaxMaturity(event.target.value)}/></label>
      <label>דירוג<input value={rating} onChange={(event) => setRating(event.target.value)} placeholder="דירוג מדויק לפי חברת דירוג"/></label>
      <label>מח״מ מינימלי<input type="number" value={minDuration} onChange={(event) => setMinDuration(event.target.value)}/></label>
      <label>מח״מ מרבי<input type="number" value={maxDuration} onChange={(event) => setMaxDuration(event.target.value)}/></label>
      <label>מחזור מסחר מינימלי<input type="number" value={minVolume} onChange={(event) => setMinVolume(event.target.value)}/></label>
      <label>מיון לפי<select value={sort} onChange={(event) => setSort(event.target.value as keyof BondMarketRecord)}><option value="spreadBp">מרווח</option><option value="duration">מח״מ</option><option value="ytm">תשואה לפדיון</option><option value="issuerNameHe">מנפיק</option><option value="maturityDate">מועד פירעון</option></select></label>
      <label><input type="checkbox" checked={hideStale} onChange={(event) => setHideStale(event.target.checked)}/> הסתר ציטוטים מיושנים</label>
    </div>
    <div className="two-column">
      <div className="panel"><h3>תשואה לפדיון מול מח״מ · {linkage === 'cpi' ? 'צמוד מדד' : 'שקלי נומינלי'}</h3>{chartRows.length > 0 ? <ResponsiveContainer width="100%" height={260}><ScatterChart><CartesianGrid/><XAxis type="number" dataKey="duration" name="מח״מ" unit=" שנים"/><YAxis type="number" dataKey="ytm" name="תשואה לפדיון" unit="%"/><Tooltip cursor={{ strokeDasharray: '3 3' }}/>{data.issuers.map((item, index) => <Scatter key={item.issuerKey} name={item.issuerNameHe} data={chartRows.filter((row) => row.issuerKey === item.issuerKey)} fill={['#386f91', '#987d54', '#536f59', '#7f638e', '#63828b'][index % 5]}/>)}</ScatterChart></ResponsiveContainer> : <div className="empty-chart">אין תצפיות מסחר מאומתות להצגה בתרשים.</div>}</div>
      <div className="panel"><h3>מרווח אשראי מול מח״מ · להשוואה</h3>{chartRows.some((row) => row.spreadBp !== null) ? <ResponsiveContainer width="100%" height={260}><ScatterChart><CartesianGrid/><XAxis type="number" dataKey="duration" name="מח״מ" unit=" שנים"/><YAxis type="number" dataKey="spreadBp" name="מרווח" unit=" נ״ב"/><Tooltip cursor={{ strokeDasharray: '3 3' }}/>{data.issuers.map((item, index) => <Scatter key={item.issuerKey} name={item.issuerNameHe} data={chartRows.filter((row) => row.issuerKey === item.issuerKey && row.spreadBp !== null)} fill={['#386f91', '#987d54', '#536f59', '#7f638e', '#63828b'][index % 5]}/>)}</ScatterChart></ResponsiveContainer> : <div className="empty-chart">אין תצפיות מרווח מאומתות להצגה בתרשים.</div>}</div>
    </div>
    <p>מרווח למח״מ (נ״ב לשנת מח״מ) הוא מדד השוואתי לא תקני; הוא אינו OAS, Z-spread או מדד אשראי תקני.</p>
    <div style={{ overflowX: 'auto' }}><table className="bond-table"><thead><tr>{columns.map((column) => <th key={column.label} onClick={() => setSort(column.sort)} style={{ cursor: 'pointer' }} title={column.help}>{column.label}</th>)}</tr></thead><tbody>{visible.map((row) => <tr key={row.id} onClick={() => setSelected(row)}><td>{row.issuerNameHe}</td><td>{row.seriesName}</td><td>{row.linkageType === 'cpi' ? 'צמוד מדד' : 'שקלי נומינלי'}</td><td>{money(row.couponRate)}{row.couponRate === null ? '' : '%'}</td><td>{money(row.linkageType === 'cpi' ? (row.realYtm ?? row.ytm) : (row.nominalYtm ?? row.ytm))}{row.ytm === null ? '' : '%'}</td><td>{money(row.duration)}</td><td>{row.benchmarkQuality}</td><td>{money(row.benchmarkYield)}{row.benchmarkYield === null ? '' : '%'}</td><td>{money(row.spreadBp, 1)}</td><td>{money(row.spreadChange1dBp, 1)}</td><td>{money(row.spreadChange5dBp, 1)}</td><td>{money(row.spreadPerDuration, 1)}</td><td>{row.tradingVolume ?? 'לא זמין'}</td><td>{row.observationDate ?? 'אין ציטוט'} · {row.quoteAgeBusinessDays === null ? 'גיל לא זמין' : `${row.quoteAgeBusinessDays} ימי מסחר`}{row.stale ? ' · מיושן' : ''}{row.timestampMismatch ? ' · מועדי התצפית שונים; המרווח משוער' : ''}</td></tr>)}</tbody></table>{visible.length === 0 && <div className="empty-chart"><p>אין נתוני מסחר מאומתים להצגה.</p><span>נתוני המנפיקים אינם ציטוטי שוק. הרשימה אינה מדרגת ואינה ממליצה על איגרות.</span></div>}</div>
    {selected && <BondDetailDrawer bond={selected} onClose={() => setSelected(null)}/>}
  </section>;
}function median(values:number[]):number|null { const sorted=[...values].sort((a,b)=>a-b); if(!sorted.length)return null; const m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2; }

function App() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MacroCard | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [apiState, setApiState] = useState<'checking' | 'connected' | 'no-data' | 'worker-unavailable' | 'database-unavailable' | 'api-error'>('checking');

  async function loadData() {
    setLoading(true);
    setApiState('checking');
    const [healthResult, overviewResult] = await Promise.allSettled([getApiHealth(), getOverview()]);
    if (overviewResult.status === 'fulfilled') {
      const next = overviewResult.value;
      setData(next);
      setUpdated(new Date());
      const hasNoData = next.cards.length > 0 && next.cards.every((card) => card.value === null);
      const databaseUnavailable = healthResult.status === 'rejected' && healthResult.reason instanceof ApiError && healthResult.reason.status === 503;
      setApiState(databaseUnavailable ? 'database-unavailable' : healthResult.status === 'fulfilled' && hasNoData ? 'no-data' : 'connected');
      setError(databaseUnavailable && healthResult.status === 'rejected' && healthResult.reason instanceof Error ? healthResult.reason.message : null);
    } else {
      const cause = overviewResult.reason;
      const healthFailure = healthResult.status === 'rejected' ? healthResult.reason : null;
      const workerUnavailable = cause instanceof ApiError && cause.kind === 'network'
        && healthFailure instanceof ApiError && healthFailure.kind === 'network';
      const databaseUnavailable = (cause instanceof ApiError && cause.status === 503)
        || (healthFailure instanceof ApiError && healthFailure.status === 503);
      setApiState(workerUnavailable ? 'worker-unavailable' : databaseUnavailable ? 'database-unavailable' : 'api-error');
      const details = [cause instanceof Error ? cause.message : 'לא ניתן לקבל את נתוני הסקירה.', healthFailure instanceof ApiError ? healthFailure.message : null].filter(Boolean);
      setError([...new Set(details)].join(' · '));
    }
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);
  const signalByKey = useMemo(() => new Map(data?.signals.map((signal) => [signal.key, signal]) ?? []), [data?.signals]);
  const outlook = useMemo(() => data ? buildOutlookSummary({ regime: data.regime, signals: data.signals }) : null, [data]);


  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark">ש</div><div className="brand-copy"><b>שוק ישראל</b><span>מעקב מאקרו ואיגרות חוב</span></div><nav className="top-nav" aria-label="ניווט ראשי"><a className="active" href="#overview">סקירה</a><a href="#curves">עקום ממשלתי</a><a href="#sources">מקורות</a></nav><div className="top-actions"><div className={`api-connection api-${apiState}`} role="status" aria-live="polite"><span className="source-dot" />{apiState==='checking'?'בודק חיבור לשרת':apiState==='connected'?'ה־API מחובר':apiState==='no-data'?'אין עדיין נתונים':apiState==='worker-unavailable'?'שרת הנתונים אינו זמין':apiState==='database-unavailable'?'מסד הנתונים אינו זמין':'שגיאת API'}</div><div className="market-open"><span className="market-pulse" />מעקב נתונים</div><button className="refresh-button" onClick={() => void loadData()} disabled={loading} aria-label="רענון נתונים"><span className={loading ? 'spinning' : ''}>↻</span>רענון</button><div className="avatar">IL</div></div></header>

    <div className="content-wrap" id="overview">
      <section className="page-intro"><div><div className="breadcrumb">ישראל <span>/</span> מאקרו וריבית</div><h1>שוק האג״ח <span>במבט מאקרו</span></h1><p>תמונת מצב שקופה של ריבית, אינפלציה ותשואות ממשלתיות</p></div><div className="as-of"><span className="as-of-icon">◷</span><div><small>בדיקת נתונים אחרונה</small><b>{updated ? dateLabel(updated.toISOString()) : 'מתחבר למקורות'}</b></div></div></section>

      {error && <div className="error-banner" role="alert"><span>!</span><div><b>{data?'החיבור נכשל — מוצגות התצפיות התקינות האחרונות':apiState==='worker-unavailable'?'שרת הנתונים אינו זמין':apiState==='database-unavailable'?'ה־Worker זמין אך מסד הנתונים אינו זמין':'ה־API החזיר שגיאה'}</b><p>{error}</p></div><button onClick={() => void loadData()}>לנסות שוב</button></div>}
      {apiState==='no-data'&&<div className="info-banner" role="status"><b>ה־Worker ומסד הנתונים זמינים, אך עדיין אין תצפיות מאקרו.</b><span>הנתונים יופיעו לאחר קליטת התצפיות הראשונות מהמקורות.</span></div>}

      <section className="regime-panel" aria-labelledby="regime-title">
        <div className="regime-layout">
          <div className="regime-outlook">
            <div className="eyebrow">תחזית קדימה · תמונת מצב בישראל</div>
            <h2 id="regime-title">{outlook?.overallLabel ?? 'מתחבר לנתונים'}</h2>
            <div className="current-state"><span>מצב נוכחי</span><p>{outlook?.currentState ?? 'ממתין לאיתותים מאומתים.'}</p></div>
            <div className="base-case"><span>תחזית קדימה — תרחיש בסיס</span><p>{outlook?.baseCaseText ?? 'התרחיש יופיע לאחר טעינת איתותי המקור.'}</p></div>
            <div className="outlook-lists">
              <div><h3>מסקנות מהמצב הקיים</h3><ul>{(outlook?.conclusionBullets ?? ['ממתין לנתוני מקור.']).map((bullet, index) => <li key={`conclusion-${index}`}>{bullet}</li>)}</ul></div>
              <div><h3>מה יכול לשנות את התמונה</h3><ul>{(outlook?.riskTriggerBullets ?? ['שינוי באינפלציה ובציפיות לה.','שינוי בתשואות הארוכות.','שינוי בתנאי הסיכון בישראל.']).map((bullet, index) => <li key={`trigger-${index}`}>{bullet}</li>)}</ul></div>
            </div>
          </div>
          <aside className="regime-rail" aria-label="סיכום איתותים">
            <div className="legacy-regime"><span>סיווג משוקלל נוכחי</span><b>{data ? regimeLabel(data.regime.status) : 'ממתין לנתוני שוק'}</b></div>
            <div className="regime-stats">
              <div className="regime-stat"><b>{data?.regime.green ?? '—'}</b><span><i className="dot-green" />חיוביים</span></div>
              <div className="regime-stat"><b>{data?.regime.yellow ?? '—'}</b><span><i className="dot-yellow" />מעורבים</span></div>
              <div className="regime-stat"><b>{data?.regime.red ?? '—'}</b><span><i className="dot-red" />שליליים</span></div>
            </div>
            <div className="confidence-stat"><span>רמת ביטחון</span><b>{outlook?.confidenceLabel ?? 'ממתין'}</b><div className="confidence-meter"><i style={{ width: data ? `${data.regime.coveragePct}%` : '0%' }} /></div><span>כיסוי איתותים</span><b>{data ? `${data.regime.coveragePct.toLocaleString('he-IL')}%` : '—'}</b></div>
          </aside>
        </div>
        <div className="regime-foot"><span>משוקלל לפי הגדרות מרכזיות · מידע חסר אינו נחשב ניטרלי</span><span>עדכון: {dateLabel(data?.generatedAt)}</span></div>
      </section>

      <div className="section-heading"><div><span className="eyebrow">מנוע איתותים · שקוף ומתועד</span><h2>ששת מדדי הליבה</h2></div><span className="heading-note"><span className="info-mark">i</span>לחיצה על כרטיס מציגה את כלל הסיווג והמקור</span></div>
      <section className="cards-grid" aria-label="ששת מדדי הליבה">{data?.cards.map((card) => <MacroCardView key={card.key} card={card} onOpen={setSelected} />) ?? Array.from({ length: 6 }, (_, index) => <div className="card-skeleton" key={index}><span /><i /><b /><small /></div>)}</section>

      <section className="panel">
        <div className="panel-title"><div><span className="eyebrow">הקשר שוק בינלאומי</span><h2>שערי חליפין, תשואות ארצות הברית ופער התשואות הריאליות</h2></div></div>
        <div className="inflation-stats">{data && [data.markets.usdIls, data.markets.us10yNominal, data.markets.us10yReal, data.markets.realYieldDifferential].map((series) => <div className="inflation-stat" key={series.key}><span>{seriesLabel(series.key)}</span><b>{numberLabel(series.value)} {marketUnitLabel(series.unit)}</b><small>{series.observationDate ?? 'ממתין לתצפית'} · {series.source}</small></div>)}</div>
        <p>שער החליפין היציג של בנק ישראל הוא אינדיקטיבי. פער התשואות הריאליות משווה בין תשואות ואינו נתון CDS.</p>
        <div className="inflation-stats">{data && [data.markets.usdIls, data.markets.us10yNominal, data.markets.us10yReal, data.markets.realYieldDifferential].map((series) => <div className="inflation-stat" key={`${series.key}-changes`}><span>שינויים זמינים · {seriesLabel(series.key)}</span>{Object.entries(series.changes).map(([key, value]) => <small key={key}>{changeLabel(key)}: {value === null ? 'אין תצפית להשוואה' : `${numberLabel(value, 2)} ${marketUnitLabel(series.unit)}`}</small>)}<small>מקור: <a href={series.sourceUrl} target="_blank" rel="noreferrer">{series.source}</a> · מצב: {marketStatusLabel(series.status)}</small></div>)}</div>
        <p>{data?.markets.riskProxy.label}: {data?.markets.riskProxy.components.map((component) => `${seriesLabel(component.key)} ${component.value === null ? 'אין נתון' : numberLabel(component.value, 2)} ${marketUnitLabel(component.unit)} (${REGIME_STATUS_HE[component.status]}, ${component.sourceObservationDate ?? 'ללא תאריך'})`).join(' · ')}</p>
      </section>
      <section className="panel"><div className="panel-title"><div><span className="eyebrow">פרסום בנק ישראל</span><h2>ציפיות אינפלציה</h2></div><span>{dateLabel(data?.expectations.publicationDate)}</span></div><div className="inflation-stats">{data?.expectations.items.map((series) => <div className="inflation-stat" key={series.key}><span>{seriesLabel(series.key)}</span><b>{series.value === null ? 'אין עדיין תצפית' : `${numberLabel(series.value)}%`}</b><small>{dateLabel(series.observationDate)} · {series.source}</small><small>מצב מקור: {marketStatusLabel(series.status)}</small></div>)}</div></section>
      <CreditPanel />
      {data && <BondScreener data={data.bondScreener} governmentCurves={data.curves} />}
      <section className="two-column" id="curves"><YieldCurvePanel real={data?.curves.real ?? []} nominal={data?.curves.nominal ?? []} /><InflationPanel data={data?.inflation ?? { latestIndex: null, mom: null, yoy: null, previousYoy: null, observationDate: null, targetLow: 1, targetHigh: 3, observations: [] }} /></section>

      <section className="panel"><div className="panel-title"><div><span className="eyebrow">תצפיות מצב יומיות</span><h2>היסטוריית מצב הסביבה</h2></div></div><RegimeHistoryChart rows={data?.regimeHistory ?? []}/><div className="source-list">{data?.regimeHistory.map((row) => <div className="source-row" key={row.date}><span>{row.date}</span><b>{REGIME_STATUS_HE[row.status]} · מדד {numberLabel(row.score, 3)} · שלמות נתונים {numberLabel(row.coveragePct, 0)}%</b><span>חיוביים {row.green} / מעורבים {row.yellow} / שליליים {row.red} · גורם תומך: {row.topPositive ?? 'אין'} · גורם מכביד: {row.topNegative ?? 'אין'}</span></div>)}</div></section>

      <section className="change-panel"><div className="change-icon">↗</div><div><span className="eyebrow">עדכון מבוסס תצפיות</span><h2>מה השתנה?</h2><p>{data ? (data.changes.bullets.join(" ") || data.changes.summary) : 'תיאור השינויים יופיע לאחר טעינת נתונים מאומתים.'}</p></div><div className="change-sources"><span>קלטים:</span>{data?.cards.filter((card) => card.value !== null).map((card) => <span className="change-chip" key={card.key}>{card.title}</span>)}</div></section>

      <section className="duration-strip"><div><span className="eyebrow">רגישות לפי מח״מ</span><h2>שלושה אופקי מעקב</h2></div><div className="duration-bucket"><b>קצר · 0–3 שנים</b><span>ריבית בנק ישראל ואינפלציה קרובה</span><i>תיאור רגישות</i></div><div className="duration-bucket"><b>בינוני · 3–7 שנים</b><span>מסלול הריבית וציפיות האינפלציה</span><i>תיאור רגישות</i></div><div className="duration-bucket"><b>ארוך · 7+ שנים</b><span>תשואה ריאלית, סיכון מדינה והיצע</span><i>תיאור רגישות</i></div></section>

      <section className="sources-layout" id="sources"><div className="sources-note"><span className="eyebrow">מקורות ראשוניים</span><h2>נתונים לפני פרשנות</h2><p>הערכים מוצגים יחד עם מקורם, מועד התצפית ועדכון הקליטה. נתון חסר או מיושן אינו מקבל צבע כיוון.</p><div className="source-legend"><span><i className="source-dot source-ok" />נתון עדכני</span><span><i className="source-dot source-stale" />נדרש עדכון</span><span><i className="source-dot source-pending" />טרם חובר</span></div></div><SourceStatusPanel sources={data?.sources ?? []} /></section>

      <footer className="footer"><div><b>שוק ישראל</b><span>לוח מאקרו וריבית · גרסת ליבה</span></div><p>המידע תיאורי ומבוסס מקורות רשמיים. אין לראות בו ייעוץ, איתות מסחר או המלצה לפעולה.</p><span>עברית מימין לשמאל · אזור הזמן ירושלים</span></footer>
    </div>

    {selected && <DetailDrawer card={selected} signal={signalByKey.get(selected.key)} onClose={() => setSelected(null)} />}
  </main>;
}

export default App;
