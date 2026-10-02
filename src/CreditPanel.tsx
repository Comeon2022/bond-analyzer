import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ApiError, getCreditSpreads, getCreditSummary } from './lib/api';
import type { CreditSourceStatus, CreditSpreadSeries, CreditSummaryResponse } from './lib/api-types';

function changeText(value: number | null): string {
  if (value === null) return 'אין די היסטוריה';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('he-IL', { maximumFractionDigits: 1 })} נ״ב`;
}

function periodText(period: string | null): string { return period ?? 'אין תצפית'; }

function statusText(status: CreditSourceStatus['status']): string {
  return status === 'healthy' ? 'עדכני' : status === 'stale' ? 'נדרשת בדיקה' : status === 'error' ? 'העדכון נכשל' : 'ממתין לנתונים';
}

export default function CreditPanel() {
  const [series, setSeries] = useState<CreditSpreadSeries[]>([]);
  const [summary, setSummary] = useState<CreditSummaryResponse | null>(null);
  const [sourceStatus, setSourceStatus] = useState<CreditSourceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState('');
  const [range, setRange] = useState<'6M' | '1Y' | 'MAX'>('1Y');

  useEffect(() => {
    let active = true;
    Promise.allSettled([getCreditSpreads(), getCreditSummary()]).then(([spreadResult, summaryResult]) => {
      if (!active) return;
      if (spreadResult.status === 'fulfilled') {
        setSeries(spreadResult.value.series);
        setSourceStatus(spreadResult.value.sourceStatus);
        setSelectedCode((current) => current || spreadResult.value.series[0]?.seriesCode || '');
      } else {
        const reason = spreadResult.reason;
        setError(reason instanceof ApiError || reason instanceof Error ? reason.message : 'לא ניתן לטעון נתוני אשראי מבנק ישראל.');
      }
      if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
      else if (spreadResult.status === 'fulfilled') {
        const reason = summaryResult.reason;
        setError(reason instanceof Error ? reason.message : 'לא ניתן לטעון את סיכום נתוני האשראי.');
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const selected = series.find((row) => row.seriesCode === selectedCode) ?? series[0] ?? null;
  const chartData = useMemo(() => {
    if (!selected) return [];
    const points = range === '6M' ? selected.history.slice(-6) : range === '1Y' ? selected.history.slice(-12) : selected.history;
    return points.map((point) => ({ period: point.timePeriod, value: point.value }));
  }, [range, selected]);
  const unresolved = selected && [selected.compCategoryLabel, selected.compNameLabel, selected.indexationTypeLabel, selected.secRankGroupLabel, selected.issuerSectorLabel].some((label) => label?.includes('לא זוהה במטא־דאטה'));

  return <section className="panel credit-panel" aria-labelledby="credit-title">
    <div className="panel-title"><div><span className="eyebrow">נתוני אשראי ממקור ציבורי</span><h2 id="credit-title">שוק האשראי הקונצרני — נתוני בנק ישראל</h2></div><span className="free-source-badge" title="הנתון מתקבל ממקור ציבורי רשמי ואינו דורש מנוי לנתוני בורסה.">מקור רשמי חינמי</span></div>
    {sourceStatus && <div className={`credit-source-status credit-${sourceStatus.status}`} role="status"><span>{statusText(sourceStatus.status)}</span><span>{sourceStatus.seriesCount} סדרות · {sourceStatus.observationCount} תצפיות · אחרון: {periodText(sourceStatus.latestObservationPeriod)}</span><a href={sourceStatus.sourcePage} target="_blank" rel="noreferrer">מקור BOI</a></div>}
    {error && <div className="error-banner" role="alert"><span>!</span><div><b>טעינת נתוני האשראי נכשלה</b><p>{error}</p>{sourceStatus?.lastError && <small>עדכון מקור אחרון: {sourceStatus.lastError}</small>}</div></div>}
    {loading && <p className="credit-message" role="status">טוען סדרות מרווח רשמיות…</p>}
    {!loading && !error && series.length === 0 && <div className="credit-message" role="status"><b>עדיין לא נקלטו סדרות מרווח.</b><span>לא נוצרו נתוני שוק מקומיים; ה־Worker יציג כאן תצפיות לאחר קליטת נתוני BOI.</span></div>}
    {series.length > 0 && <>
      <div className="credit-summary-grid">
        <div><small>תקופה משותפת אחרונה</small><b>{periodText(summary?.latestCommonObservationPeriod ?? null)}</b></div>
        <div><small>המרווח הרחב ביותר</small><b>{summary?.widestCurrentSpread ? `${summary.widestCurrentSpread.value.toLocaleString('he-IL', { maximumFractionDigits: 3 })} · ${summary.widestCurrentSpread.label}` : 'אין נתון'}</b></div>
        <div><small>המרווח הצר ביותר</small><b>{summary?.narrowestCurrentSpread ? `${summary.narrowestCurrentSpread.value.toLocaleString('he-IL', { maximumFractionDigits: 3 })} · ${summary.narrowestCurrentSpread.label}` : 'אין נתון'}</b></div>
        <div><small>כיסוי מטא־דאטה</small><b>{summary ? `${summary.coverage.metadataResolvedSeries}/${series.length} סדרות` : 'טוען'}</b></div>
      </div>
      <div className="credit-series-table-wrap"><table className="credit-series-table"><thead><tr><th>סדרה / קטגוריה</th><th>מרווח אחרון</th><th>חודש תצפית</th><th>שינוי חודשי</th><th>שינוי 3 חודשים</th><th>הצמדה</th><th>דירוג</th><th>ענף</th></tr></thead><tbody>{series.map((row) => <tr key={row.seriesCode} className={row.seriesCode === selectedCode ? 'selected' : ''} onClick={() => setSelectedCode(row.seriesCode)}><td><b>{row.compCategoryLabel || row.label}</b><small>{row.seriesCode} · {row.compNameLabel}</small></td><td>{row.latest ? `${row.latest.value.toLocaleString('he-IL', { maximumFractionDigits: 3 })} ${row.unitMeasureLabel === 'Percent' || row.unitMeasure === 'PT' ? '%' : row.unitMeasureLabel ?? ''}` : 'אין תצפית'}</td><td>{periodText(row.latestObservationPeriod)}</td><td>{changeText(row.change1m)}</td><td>{changeText(row.change3m)}</td><td>{row.indexationTypeLabel}</td><td>{row.secRankGroupLabel}</td><td>{row.issuerSectorLabel}</td></tr>)}</tbody></table></div>
      {unresolved && <p className="metadata-warning" role="status">חלק מקודי הסדרה לא זוהו במטא־דאטה הרשמי של בנק ישראל. הקודים מוצגים ללא ניחוש תוויות.</p>}
      {selected && <div className="credit-chart-block"><div className="panel-title"><div><span className="eyebrow">היסטוריה חודשית · {selected.seriesCode}</span><h3>{selected.label}</h3></div><div className="credit-chart-controls"><label>סדרה<select value={selected.seriesCode} onChange={(event) => setSelectedCode(event.target.value)}>{series.map((row) => <option key={row.seriesCode} value={row.seriesCode}>{row.label}</option>)}</select></label><div role="group" aria-label="טווח היסטוריה">{(['6M', '1Y', 'MAX'] as const).map((option) => <button key={option} className={range === option ? 'active' : ''} onClick={() => setRange(option)}>{option}</button>)}</div></div></div>
        <div className="credit-chart" role="img" aria-label={`היסטוריית מרווח ${selected.label}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}><CartesianGrid stroke="#e9e5dd" vertical={false}/><XAxis dataKey="period" tick={{ fontSize: 11 }}/><YAxis tick={{ fontSize: 11 }} width={48}/><Tooltip formatter={(value) => [`${Number(value).toLocaleString('he-IL', { maximumFractionDigits: 3 })}`, 'מרווח']} labelFormatter={(value) => `תקופה: ${value}`}/><Line type="monotone" dataKey="value" stroke="#25847c" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls={false}/></LineChart></ResponsiveContainer></div>
        <small className="credit-provenance">מקור: <a href={selected.sourceUrl} target="_blank" rel="noreferrer">בנק ישראל, מאגר SDMX SECDWH</a> · נתונים חודשיים כפי שפורסמו · {selected.stale ? 'העדכון האחרון ישן' : 'עדכון עדכני'} · שינויי מרווח מחושבים בנקודות בסיס כאשר יחידת המקור הרשמית היא אחוז או נקודות אחוז.</small>
      </div>}
      {summary?.changes.bullets.length ? <div className="credit-changes"><b>מה השתנה?</b>{summary.changes.bullets.map((bullet, index) => <span key={`${index}-${bullet}`}>{bullet}</span>)}</div> : null}
    </>}
  </section>;
}
