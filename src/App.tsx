import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Scatter, ScatterChart,
} from 'recharts';
import type { MacroCard, OverviewResponse, SignalStatus, SourceStatus, YieldPoint } from '../shared/types';
import type { BondMarketRecord } from '../shared/bonds';
import { matchGovernmentBenchmark } from '../shared/bonds';
import { apiGet, getApiHealth, getOverview } from './lib/api';


const STATUS: Record<SignalStatus, { label: string; className: string }> = {
  green: { label: '×ª×•×ž×š ×‘×™×¨×™×“×ª ×ª×©×•××•×ª', className: 'positive' },
  yellow: { label: '×ž×¢×•×¨×‘', className: 'caution' },
  red: { label: '×ª×•×ž×š ×‘×¢×œ×™×™×ª ×ª×©×•××•×ª', className: 'negative' },
  unknown: { label: '××™×Ÿ × ×ª×•×Ÿ ×ž××•×ž×ª', className: 'unknown' },
};

const SOURCE_STATUS: Record<SourceStatus['status'], string> = { ok: '×¢×•×“×›×Ÿ', stale: '× ×ª×•×Ÿ ×™×©×Ÿ', error: '×©×’×™××ª ×¢×“×›×•×Ÿ', pending: '×ž×ž×ª×™×Ÿ ×œ× ×ª×•× ×™×' };

function dateLabel(date: string | null | undefined): string {
  if (!date) return '×œ× ×–×ž×™×Ÿ';
  const value = new Date(date);
  if (Number.isNaN(value.valueOf())) return date;
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: date.includes('T') ? 'short' : undefined, timeZone: 'Asia/Jerusalem' }).format(value);
}

function numberLabel(value: number | null, digits = 2): string {
  return value === null || !Number.isFinite(value) ? 'â€”' : new Intl.NumberFormat('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
}

function deltaLabel(card: MacroCard): { text: string; className: string } | null {
  if (card.change === null) return null;
  const isBasisPoints = card.key === 'policy_rate' || card.key === 'long_real_yield' || card.key === 'long_yield_momentum';
  const value = numberLabel(card.change, isBasisPoints ? 1 : 2);
  const text = card.key === 'policy_rate' ? `${card.change > 0 ? '+' : ''}${value} × ×´×‘ ×ž××– ×”×¢×“×›×•×Ÿ ×”×§×•×“×`
    : card.key === 'cpi_inflation' ? `${card.change > 0 ? '+' : ''}${value}% ×©×™× ×•×™ ×—×•×“×©×™ ×‘×ž×“×“`
      : `${card.change > 0 ? '+' : ''}${value} × ×´×‘ ×œ×¢×•×ž×ª ×ª×¦×¤×™×ª ×§×•×“×ž×ª`;
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
  return <svg className="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" aria-label="×ž×’×ž×ª × ×ª×•× ×™× ×”×™×¡×˜×•×¨×™×ª"><polyline points={points} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" /></svg>;
}

function SourceDot({ status }: { status: SourceStatus['status'] }) {
  return <span className={`source-dot source-${status}`} aria-hidden="true" />;
}

function MacroCardView({ card, onOpen }: { card: MacroCard; onOpen: (card: MacroCard) => void }) {
  const status = STATUS[card.status];
  const delta = deltaLabel(card);
  const mainValue = card.key === 'long_yield_momentum' ? card.value === null ? 'â€”' : `${numberLabel(card.value, 1)} × ×´×‘`
    : card.value === null ? 'â€”' : `${numberLabel(card.value)}${card.unit ? ` ${card.unit}` : ''}`;
  const sourceAvailable = card.sourceUrl !== '#';
  return (
    <button className={`signal-card ${status.className} ${card.pending ? 'pending' : ''}`} onClick={() => onOpen(card)} aria-label={`×¤×¨×˜×™×: ${card.title}`}>
      <div className="card-topline"><span className="card-category">{card.pending ? '×‘×©×œ×‘ ×”×‘×' : card.key === 'cpi_inflation' ? '×ž×—×™×¨×™×' : card.key === 'policy_rate' ? '×ž×“×™× ×™×•×ª ×ž×•× ×™×˜×¨×™×ª' : '×¢×§×•× ×ž×ž×©×œ×ª×™'}</span><span className={`status-pill ${status.className}`}><SourceDot status={card.pending ? 'pending' : card.status === 'unknown' ? 'pending' : 'ok'} />{status.label}</span></div>
      <div className="card-title">{card.title}<span className="arrow" aria-hidden="true">â†—</span></div>
      <div className={`metric-value ${card.value === null ? 'no-value' : ''}`}>{mainValue}</div>
      {card.key === 'cpi_inflation' && <div className="metric-caption">×©×™× ×•×™ ×‘-12 ×”×—×•×“×©×™× ×”××—×¨×•× ×™×</div>}
      {card.key === 'long_yield_momentum' && <div className="metric-caption">×ª× ×•×¢×” ×‘×ª×§×•×¤×ª ×ž×§×•×¨ ×©×œ ×›×—×•×“×©</div>}
      {delta && <div className={`metric-delta ${delta.className}`}>{delta.text}</div>}
      {!delta && card.pending && <div className="metric-delta">×ž×§×•×¨ ×¨×©×ž×™ ×˜×¨× ×—×•×‘×¨</div>}
      <div className="sparkline-wrap"><Sparkline data={card.history} status={card.status} /></div>
      <div className="card-explanation">{card.explanation}</div>
      <div className="card-footer"><span>{sourceAvailable ? card.source : '×ž×§×•×¨ ×‘×ª×”×œ×™×š'}</span><span>{dateLabel(card.observedAt)}</span></div>
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
    policy_rate: ['×™×¨×•×§: ×™×¨×™×“×” ×‘×¨×™×‘×™×ª ×œ×¢×•×ž×ª ×”×ª×¦×¤×™×ª ×”×–×ž×™× ×” ×ž×œ×¤× ×™ ×›-20 ×ª×¦×¤×™×•×ª.', '×¦×”×•×‘: ×©×™× ×•×™ ×§×˜×Ÿ ××• ×™×¦×™×‘×•×ª.', '××“×•×: ×¢×œ×™×™×” ×‘×¨×™×‘×™×ª ×œ×¢×•×ž×ª ×ª×¦×¤×™×ª ×”×”×©×•×•××”.', '×”×¨×™×‘×™×ª ×”×§×¦×¨×” ×ž×©×¤×™×¢×” ××š ××™× ×” ×§×•×‘×¢×ª ×ž×›× ×™×ª ×ª×©×•××•×ª ××¨×•×›×•×ª.'],
    cpi_inflation: ['×™×¨×•×§: ××™× ×¤×œ×¦×™×” ×©× ×ª×™×ª ×‘×ª×•×š ×”×™×¢×“ ×•×‘×ž×’×ž×ª ×™×¨×™×“×”.', '×¦×”×•×‘: ×‘×ª×•×š ×”×™×¢×“ ×œ×œ× ×ž×’×ž×ª ×™×¨×™×“×” ×‘×¨×•×¨×”.', '××“×•×: ×ž×¢×œ ×”×™×¢×“ ××• ×¢×œ×™×™×” ×ž×©×ž×¢×•×ª×™×ª.', '×”×—×™×©×•×‘ ×ž×‘×•×¡×¡ ×¢×œ ×¨×ž×•×ª ×”×ž×“×“ ×”×—×•×“×©×™ ×©×œ ×”×œ×ž×´×¡.'],
    inflation_expectations: ['×ž×§×•×¨ ×¡×“×¨×ª ×¦×™×¤×™×•×ª ×¨×©×ž×™ ×™×™×‘×“×§ ×•×™×—×•×‘×¨ ×‘×©×œ×‘ ×”×‘×.', '×œ× ×ž×•×¦×’ × ×ª×•×Ÿ ×—×œ×•×¤×™ ××• ××•×ž×“×Ÿ ×œ× ×ž××•×ž×ª.'],
    israel_risk_proxy: ['×ž×§×•×¨ CDS ××• ×¤×¨×•×§×¡×™ ×¡×™×›×•×Ÿ ×©×•×§ ×™×™×‘×“×§ ×•×™×—×•×‘×¨ ×‘×©×œ×‘ ×”×‘×.', '×œ× ×ž×•×¦×’ × ×ª×•×Ÿ CDS ×ž×•×ž×¦×.'],
    long_real_yield: ['×™×¨×•×§: ×™×¨×™×“×” ×ž×•×œ ×”×ª×¦×¤×™×ª ×”×¨×©×ž×™×ª ×”×–×ž×™× ×” ×ž×œ×¤× ×™ ×›×—×•×“×©.', '×¦×”×•×‘: ×©×™× ×•×™ ×‘×˜×•×•×— ×©×œ 5 × ×´×‘.', '××“×•×: ×¢×œ×™×™×” ×ž×•×œ ×”×ª×¦×¤×™×ª ×”×¨×©×ž×™×ª ×”×–×ž×™× ×” ×ž×œ×¤× ×™ ×›×—×•×“×©.', '×¨×ž×ª ×”×ª×©×•××” ×•×ž×’×ž×ª×” ×ž×•×¦×’×•×ª ×‘× ×¤×¨×“.'],
    long_yield_momentum: ['×”×¢×§×•× ×”×¨×©×ž×™ ×ž×ª×¤×¨×¡× ×›×ž×ž×•×¦×¢×™× ×—×¦×™-×—×•×“×©×™×™×.', '×¡×“×¨×•×ª 5/20/60 ×™×ž×™ ×ž×¡×—×¨ ×•×ž×ž×•×¦×¢×™× × ×¢×™× ×™×•×ž×™×™× ××™× ×Ÿ ×ž×—×•×©×‘×•×ª ×ž×”×ª×“×™×¨×•×ª ×”×–×ž×™× ×”.'],
  };
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button className="close-button" onClick={onClose} aria-label="×¡×’×™×¨×”">Ã—</button>
      <div className="eyebrow">×¤×™×¨×•×˜ ×ž×§×•×¨ ×•×›×œ×œ</div>
      <h2 id="detail-title">{card.title}</h2>
      <div className="drawer-value">{card.value === null ? '××™×Ÿ × ×ª×•×Ÿ' : `${numberLabel(card.value)}${card.unit ? ` ${card.unit}` : ''}`}</div>
      <span className={`status-pill ${state.className}`}><SourceDot status={card.status === 'unknown' ? 'pending' : 'ok'} />{state.label}</span>
      <p className="drawer-explanation">{card.explanation}</p>
      <div className="drawer-section"><h3>×›×œ×œ ×”×¡×™×•×•×’</h3><ul>{(rules[card.key] ?? []).map((rule) => <li key={rule}>{rule}</li>)}</ul></div>
      {signal && <div className="drawer-section"><h3>×¢×¨×›×™ ×”×—×™×©×•×‘</h3><dl className="details-grid">{Object.entries(signal.value).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'number' ? numberLabel(value, 3) : value ?? 'â€”'}</dd></div>)}</dl></div>}
      <div className="drawer-section provenance"><h3>×ž×§×•×¨ ×•×ª×–×ž×•×Ÿ</h3><p>{card.source}</p><p>×ª××¨×™×š ×ª×¦×¤×™×ª: {dateLabel(card.observedAt)}</p><p>×§×œ×™×˜×” ××—×¨×•× ×”: {dateLabel(typeof card.details.sourceFetchedAt === 'string' ? card.details.sourceFetchedAt : null)}</p>{card.sourceUrl !== '#' && <a href={card.sourceUrl} target="_blank" rel="noreferrer">×¤×ª×™×—×ª ×”×ž×§×•×¨ ×”×¨×©×ž×™ â†—</a>}</div>
    </section>
  </div>;
}

function YieldCurvePanel({ real, nominal }: { real: YieldPoint[]; nominal: YieldPoint[] }) {
  const curve = useMemo(() => makeCurveChart(real, nominal), [real, nominal]);
  if (!curve.values.length) return <section className="panel chart-panel"><div className="panel-title"><div><span className="eyebrow">×¢×§×•× ×ž×ž×©×œ×ª×™</span><h2>×ª×©×•××” ×œ×¤×™ ×˜×•×•×— ×œ×¤×“×™×•×Ÿ</h2></div><span className="source-empty">×ž×ž×ª×™×Ÿ ×œ×¢×“×›×•×Ÿ ×ž×§×•×¨ ×¨×©×ž×™</span></div><EmptyChart /></section>;
  return <section className="panel chart-panel">
    <div className="panel-title"><div><span className="eyebrow">×¢×§×•× ×ž×ž×©×œ×ª×™</span><h2>×ª×©×•××” ×œ×¤×™ ×˜×•×•×— ×œ×¤×“×™×•×Ÿ</h2><p>×¢×§×•× ××¤×¡ ×©×œ ×‘× ×§ ×™×©×¨××œ Â· ×ž×ž×•×¦×¢×™× ×”×ž×ª×¤×¨×¡×ž×™× ×‘×§×•×‘×¥ ×”×ž×§×•×¨</p></div><div className="chart-date">×ª×¦×¤×™×ª ××—×¨×•× ×” <b>{dateLabel(curve.latestDate)}</b></div></div>
    <div className="chart-legend"><span><i className="legend-line nominal" />× ×•×ž×™× ×œ×™×ª</span><span><i className="legend-line real" />×¨×™××œ×™×ª</span>{curve.previousDate && <span><i className="legend-line previous" />×ª×¦×¤×™×ª ×§×•×“×ž×ª ×–×ž×™× ×”</span>}</div>
    <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={curve.values} margin={{ top: 12, right: 8, left: 4, bottom: 4 }}>
      <CartesianGrid stroke="#e8edf2" vertical={false} />
      <XAxis dataKey="tenor" axisLine={false} tickLine={false} tick={{ fill: '#738091', fontSize: 12 }} />
      <YAxis orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#738091', fontSize: 12 }} tickFormatter={(value: number) => `${value}%`} width={52} domain={['auto', 'auto']} />
      <Tooltip formatter={(value: number | string) => [`${numberLabel(Number(value), 3)}%`, '']} labelFormatter={(label) => `×˜×•×•×— ×œ×¤×“×™×•×Ÿ: ${label}`} contentStyle={{ border: '1px solid #e5eaf0', borderRadius: 8, direction: 'rtl', fontFamily: 'inherit' }} />
      <Line type="monotone" dataKey="nominal" name="× ×•×ž×™× ×œ×™×ª Â· ×¢×“×›× ×™" stroke="#173c65" strokeWidth={2.7} dot={{ r: 3 }} connectNulls />
      <Line type="monotone" dataKey="real" name="×¨×™××œ×™×ª Â· ×¢×“×›× ×™" stroke="#137c69" strokeWidth={2.7} dot={{ r: 3 }} connectNulls />
      {curve.previousDate && <Line type="monotone" dataKey="nominalMonth" name={`× ×•×ž×™× ×œ×™×ª Â· ${dateLabel(curve.previousDate)}`} stroke="#173c65" strokeOpacity={0.4} strokeDasharray="5 5" dot={false} connectNulls />}
      {curve.previousDate && <Line type="monotone" dataKey="realMonth" name={`×¨×™××œ×™×ª Â· ${dateLabel(curve.previousDate)}`} stroke="#137c69" strokeOpacity={0.4} strokeDasharray="5 5" dot={false} connectNulls />}
      {curve.yearDate && <Line type="monotone" dataKey="nominalYear" name={`× ×•×ž×™× ×œ×™×ª Â· ${dateLabel(curve.yearDate)}`} stroke="#173c65" strokeOpacity={0.2} strokeDasharray="2 4" dot={false} connectNulls />}
      {curve.yearDate && <Line type="monotone" dataKey="realYear" name={`×¨×™××œ×™×ª Â· ${dateLabel(curve.yearDate)}`} stroke="#137c69" strokeOpacity={0.2} strokeDasharray="2 4" dot={false} connectNulls />}
      <Legend wrapperStyle={{ display: 'none' }} />
    </LineChart></ResponsiveContainer></div>
    <div className="chart-source"><span>×”×ž×§×•×¨ ×ž×¤×¨×¡× ×ª×¦×¤×™×•×ª Calendar ×•-CPI-dated ×‘×§×™×¨×•×‘ ×¤×¢×ž×™×™× ×‘×—×•×“×©.</span><span>×¨×™×‘×™×ª × ×•×ž×™× ×œ×™×ª ××™× ×” ×ª×—×–×™×ª ×ª×©×•××” ×ž×ž×•×ž×©×ª.</span></div>
  </section>;
}

function EmptyChart() { return <div className="empty-chart"><div className="empty-chart-icon">âŒ</div><p>××™×Ÿ ×¢×“×™×™×Ÿ ×ª×¦×¤×™×•×ª ×©×ž×•×¨×•×ª</p><span>×”×¢×“×›×•×Ÿ ×”×ž×ª×•×–×ž×Ÿ ×™×ž×©×•×š × ×ª×•× ×™× ×ž×ž×§×•×¨ ×¨×©×ž×™ ×•×™×©×ž×•×¨ ×”×™×¡×˜×•×¨×™×”.</span></div>; }

function InflationPanel({ data }: { data: OverviewResponse['inflation'] }) {
  const chartData = data.observations.slice(-36).map((point) => ({ date: point.observationDate.slice(0, 7), index: point.value }));
  return <section className="panel inflation-panel">
    <div className="panel-title"><div><span className="eyebrow">× ×ª×•× ×™ ×ž×—×™×¨×™× Â· ×”×œ×ž×´×¡</span><h2>×ž×“×“ ×”×ž×—×™×¨×™× ×œ×¦×¨×›×Ÿ</h2><p>×¨×ž×ª ×”×ž×“×“ ×•×”××™× ×¤×œ×¦×™×” ×”×ž×—×•×©×‘×ª ×ž×ž× ×”</p></div><a className="source-link" href="https://www.cbs.gov.il/en/cbsNewBrand/Pages/Api-Indices.aspx" target="_blank" rel="noreferrer">×ª×™×¢×•×“ API â†—</a></div>
    <div className="inflation-stats">
      <div className="inflation-stat"><span>××™× ×¤×œ×¦×™×” ×©× ×ª×™×ª</span><b>{data.yoy === null ? 'â€”' : `${numberLabel(data.yoy)}%`}</b><small>×œ×¤×™ 12 ×—×•×“×©×™ ×ž×“×“</small></div>
      <div className="inflation-stat"><span>×©×™× ×•×™ ×—×•×“×©×™</span><b>{data.mom === null ? 'â€”' : `${data.mom > 0 ? '+' : ''}${numberLabel(data.mom)}%`}</b><small>×œ×¢×•×ž×ª ×”×—×•×“×© ×”×§×•×“×</small></div>
      <div className="inflation-stat"><span>×™×¢×“ ×‘× ×§ ×™×©×¨××œ</span><b>{data.targetLow}â€“{data.targetHigh}%</b><small>×˜×•×•×— ×™×¢×“ ×©× ×ª×™</small></div>
      <div className="inflation-stat"><span>×—×•×“×© ×ž×“×“ ××—×¨×•×Ÿ</span><b>{data.observationDate ? dateLabel(data.observationDate) : 'â€”'}</b><small>×œ×œ× ×”×©×œ×ž×” ×œ× ×ª×•×Ÿ ×™×•×ž×™</small></div>
    </div>
    <div className="mini-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}><CartesianGrid stroke="#e8edf2" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#8290a0', fontSize: 10 }} minTickGap={34} /><YAxis orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#8290a0', fontSize: 10 }} width={48} domain={['auto', 'auto']} /><Tooltip formatter={(value: number | string) => [numberLabel(Number(value), 3), '×ž×“×“']} contentStyle={{ borderRadius: 8, direction: 'rtl', fontFamily: 'inherit' }} /><Line type="monotone" dataKey="index" name="×¨×ž×ª ×”×ž×“×“" stroke="#c18735" strokeWidth={2.2} dot={false} /></LineChart></ResponsiveContainer>{chartData.length < 2 && <div className="chart-overlay">×”×™×¡×˜×•×¨×™×™×ª ×”×ž×“×“ ×ª×•×¤×™×¢ ×œ××—×¨ ×§×œ×™×˜×ª × ×ª×•× ×™ ×”×œ×ž×´×¡</div>}</div>
    <div className="chart-source"><span>×”×¢×¨×›×™× ×”×ž×§×•×¨×™×™× ×©× ×©×ž×¨×™×: ×¨×ž×ª ×”×ž×“×“ ×•×”×—×•×“×© ×©××œ×™×• ×”×™× ×ž×ª×™×™×—×¡×ª.</span><span>× ×›×•×Ÿ ×œ-{dateLabel(data.observationDate)}</span></div>
  </section>;
}

function SourceStatusPanel({ sources }: { sources: SourceStatus[] }) {
  return <section className="panel sources-panel"><div className="panel-title"><div><span className="eyebrow">×©×§×™×¤×•×ª × ×ª×•× ×™×</span><h2>×ž×§×•×¨×•×ª ×•×¢×“×›×•× ×™×</h2></div><span className="source-count">{sources.filter((source) => source.status === 'ok').length} ×ž×§×•×¨×•×ª ×ª×§×™× ×™×</span></div>
    <div className="source-list">{sources.map((source) => <a className="source-row" href={source.url} key={source.key} target="_blank" rel="noreferrer"><div className="source-main"><SourceDot status={source.status} /><span>{source.name}</span><small>{SOURCE_STATUS[source.status]}</small></div><div className="source-meta"><span>{source.observationDate ? `×ª×¦×¤×™×ª ${dateLabel(source.observationDate)}` : source.lastError ?? '×˜×¨× × ×§×œ×˜×• × ×ª×•× ×™×'}</span><span>{source.lastSuccessAt ? `× ×‘×“×§ ${dateLabel(source.lastSuccessAt)}` : ''}</span></div></a>)}</div>
    <p className="source-policy">×‘×¢×ª ×©×’×™××ª ×ž×§×•×¨ × ×©×ž×¨×ª ×”×ª×¦×¤×™×ª ×”×ª×§×™× ×” ×”××—×¨×•× ×”, ×•×”××•×ª ×ž×•×¦×’ ×›×œ× ×–×ž×™×Ÿ ×›×©×”× ×ª×•×Ÿ ×¢×•×‘×¨ ××ª ×¡×£ ×”×”×ª×™×™×©× ×•×ª.</p>
  </section>;
}

function RegimeHistoryChart({rows}:{rows:OverviewResponse['regimeHistory']}) {
  const ordered=[...rows].reverse();
  const points=(metric:'score'|'coveragePct')=>ordered.map((row,index)=>`${ordered.length<2?300:index/(ordered.length-1)*590+5},${metric==='score'?80-((row.score ?? 0)+1)*35:80-row.coveragePct*.7}`).join(' ');
  return <svg viewBox="0 0 600 90" role="img" aria-label="Regime score and coverage history" style={{width:'100%',height:120}}><polyline points={points('score')} fill="none" stroke="#137c69" strokeWidth="2"/><polyline points={points('coveragePct')} fill="none" stroke="#c18735" strokeWidth="2"/><text x="590" y="12" textAnchor="end" fill="#137c69">score</text><text x="590" y="27" textAnchor="end" fill="#c18735">coverage</text></svg>;
}

function BondDetailDrawer({bond,onClose}:{bond:BondMarketRecord;onClose:()=>void}) {
 const [period,setPeriod]=useState('MAX'); const [history,setHistory]=useState<Array<{observationDate:string;cleanPrice:number|null;ytm:number|null;realYtm:number|null;nominalYtm:number|null;revision:number;ingestedAt:string}>>([]); const [spreads,setSpreads]=useState<Array<{observation_date:string;spread_bp:number|null;benchmark_yield:number|null}>>([]); const [cashflows,setCashflows]=useState<Array<{paymentDate:string;couponAmount:number|null;principalPercentage:number|null}>>([]); const [detailError,setDetailError]=useState<string|null>(null); const [detailLoading,setDetailLoading]=useState(true);
 useEffect(()=>{let active=true;setDetailLoading(true);void Promise.all([apiGet<{observations:Array<{observationDate:string;cleanPrice:number|null;ytm:number|null;realYtm:number|null;nominalYtm:number|null;revision:number;ingestedAt:string}>}>(`/api/bonds/${encodeURIComponent(bond.id)}/history`),apiGet<{observations:Array<{observation_date:string;spread_bp:number|null;benchmark_yield:number|null}>}>(`/api/bonds/${encodeURIComponent(bond.id)}/benchmark`),apiGet<{cashflows:Array<{paymentDate:string;couponAmount:number|null;principalPercentage:number|null}>}>(`/api/bonds/${encodeURIComponent(bond.id)}`)]).then(([h,b,d])=>{if(active){setHistory(h.observations);setSpreads(b.observations);setCashflows(d.cashflows);setDetailError(null);}}).catch((cause:unknown)=>{if(active)setDetailError(cause instanceof Error?cause.message:'×œ× × ×™×ª×Ÿ ×œ×˜×¢×•×Ÿ ××ª ×¤×¨×˜×™ ×”××™×’×¨×ª.');}).finally(()=>{if(active)setDetailLoading(false);});return()=>{active=false};},[bond.id]);
 const cutoff=new Date();if(period==='1M')cutoff.setMonth(cutoff.getMonth()-1);else if(period==='3M')cutoff.setMonth(cutoff.getMonth()-3);else if(period==='6M')cutoff.setMonth(cutoff.getMonth()-6);else if(period==='1Y')cutoff.setFullYear(cutoff.getFullYear()-1);
 const visible=history.filter(row=>period==='MAX'||new Date(row.observationDate)>=cutoff).map(row=>({...row,spreadBp:spreads.find(x=>x.observation_date===row.observationDate)?.spread_bp??null}));
 const fields:{label:string;value:string|number|null}[]=[{label:'Security ID',value:bond.securityId},{label:'Linkage',value:bond.linkageType},{label:'Coupon',value:bond.couponRate},{label:'Maturity',value:bond.maturityDate},{label:'Clean price',value:bond.cleanPrice},{label:'Dirty price',value:bond.dirtyPrice},{label:'YTM',value:bond.ytm},{label:'Duration',value:bond.duration},{label:'Outstanding',value:bond.outstandingAmount},{label:'Last trade',value:bond.lastTradeAt},{label:'Rating / agency',value:bond.rating?`${bond.rating} / ${bond.ratingAgency??'?'}`:null},{label:'Rating date',value:bond.ratingDate},{label:'Collateral',value:bond.collateralSummary}];
 return <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="detail-drawer" role="dialog" aria-modal="true"><button className="close-button" onClick={onClose}>&times;</button><h2>{bond.issuerNameHe} ? {bond.seriesName}</h2>{detailLoading&&<p role="status">טוען נתונים…</p>}{detailError&&<div className="error-banner" role="alert"><div><b>לא ניתן לטעון נתוני היסטוריה</b><p>{detailError}</p></div></div>}<h3>Overview</h3><dl className="details-grid">{fields.map(x=><div key={x.label}><dt>{x.label}</dt><dd>{x.value??'?'}</dd></div>)}</dl><h3>Relative value</h3><p>Benchmark: {bond.benchmarkYield??'?'}% ? {bond.benchmarkQuality} ? spread {bond.spreadBp??'?'} bp ? spread/duration {bond.spreadPerDuration??'?'} bp/year</p><p>This spread/duration ratio is an informal heuristic, not OAS or Z-spread.</p><h3>History</h3><div className="bond-filters">{['1M','3M','6M','1Y','MAX'].map(x=><button key={x} onClick={()=>setPeriod(x)} aria-pressed={period===x}>{x}</button>)}</div>{visible.length>0&&<ResponsiveContainer width="100%" height={200}><LineChart data={visible}><CartesianGrid stroke="#e8edf2"/><XAxis dataKey="observationDate"/><YAxis yAxisId="price"/><YAxis yAxisId="yield" orientation="right"/><Tooltip/><Legend/><Line yAxisId="price" dataKey="cleanPrice" name="Clean price" stroke="#386f91" dot={false}/><Line yAxisId="yield" dataKey={bond.linkageType==='cpi'?'realYtm':'nominalYtm'} name="Yield to maturity" stroke="#987d54" dot={false}/><Line yAxisId="yield" dataKey="spreadBp" name="Spread (bp)" stroke="#536f59" dot={false}/></LineChart></ResponsiveContainer>}{!detailLoading&&!detailError&&!visible.length&&<p>No licensed bond history is available for this series.</p>}<h3>Cash-flow / principal schedule</h3>{cashflows.length?cashflows.map((x,i)=><p key={`${x.paymentDate}-${i}`}>{x.paymentDate} ? coupon {x.couponAmount??'?'} ? principal {x.principalPercentage??'?'}%</p>):<p>No source-backed payment schedule is available.</p>}<h3>Risk notes / provenance</h3><p>{bond.collateralSummary??'No collateral field in licensed source data.'} ? Quote status: {bond.stale?'stale':'fresh'} ? Source: {bond.sourceUrl??'pending'} ? observation {bond.observationDate??'?'}.</p></section></div>;
}

function BondScreener({data,governmentCurves}:{data:OverviewResponse['bondScreener'];governmentCurves:OverviewResponse['curves']}) {
  const [issuer,setIssuer]=useState(''); const [linkage,setLinkage]=useState<'cpi'|'nominal'>('cpi');
  const [rating,setRating]=useState(''); const [minMaturity,setMinMaturity]=useState(''); const [maxMaturity,setMaxMaturity]=useState(''); const [minDuration,setMinDuration]=useState(''); const [maxDuration,setMaxDuration]=useState('');
  const [minVolume,setMinVolume]=useState(''); const [hideStale,setHideStale]=useState(false); const [sort,setSort]=useState<keyof BondMarketRecord>('seriesName'); const [selected,setSelected]=useState<BondMarketRecord|null>(null);
  const visible=useMemo(()=>data.rows.filter(r=>(!issuer||r.issuerKey===issuer)&&r.linkageType===linkage&&(!rating||r.rating===rating)&&(!minMaturity||(r.maturityDate??'')>=minMaturity)&&(!maxMaturity||(r.maturityDate??'')<=maxMaturity)&&(minDuration===''||(r.duration??-1)>=Number(minDuration))&&(maxDuration===''||(r.duration??Infinity)<=Number(maxDuration))&&(minVolume===''||(r.tradingVolume??-1)>=Number(minVolume))&&(!hideStale||!r.stale)).sort((a,b)=>String(a[sort]??'').localeCompare(String(b[sort]??''),undefined,{numeric:true})),[data.rows,issuer,linkage,rating,minDuration,maxDuration,minVolume,hideStale,sort,minMaturity,maxMaturity]);
  const chartRows=visible.filter(r=>r.duration!==null&&r.ytm!==null); const medianFresh=(select:(r:BondMarketRecord)=>number|null)=>{const vals=visible.filter(r=>!r.stale).map(select).filter((v):v is number=>v!==null);return vals.length>=3?median(vals):null;}; const gov5=matchGovernmentBenchmark(linkage,5,null,{cpi:governmentCurves.real.map(p=>({tenorYears:p.tenorYears,yieldPercent:p.value})),nominal:governmentCurves.nominal.map(p=>({tenorYears:p.tenorYears,yieldPercent:p.value}))}).yieldPercent; const gov10=matchGovernmentBenchmark(linkage,10,null,{cpi:governmentCurves.real.map(p=>({tenorYears:p.tenorYears,yieldPercent:p.value})),nominal:governmentCurves.nominal.map(p=>({tenorYears:p.tenorYears,yieldPercent:p.value}))}).yieldPercent; const infra5=visible.filter(r=>!r.stale&&r.duration!==null&&r.duration>=4&&r.duration<=6&&r.ytm!==null).map(r=>r.ytm!); const infra10=visible.filter(r=>!r.stale&&r.duration!==null&&r.duration>=9&&r.duration<=11&&r.ytm!==null).map(r=>r.ytm!);
  const money=(v:number|null,d=2)=>v===null?'?':numberLabel(v,d); const sortKeys:Record<string,keyof BondMarketRecord>={Issuer:'issuerNameHe',Series:'seriesName',Linkage:'linkageType',Coupon:'couponRate',YTM:'ytm',Duration:'duration','Government benchmark':'benchmarkQuality','Benchmark yield':'benchmarkYield','Spread bp':'spreadBp','Daily 1D':'spreadChange1dBp','Weekly 5D':'spreadChange5dBp','bp / duration':'spreadPerDuration',Volume:'tradingVolume','Observation / quote age':'observationDate'};
  return <section className="panel bond-screener" dir="rtl"><div className="panel-title"><div><span className="eyebrow">Phase 1C ? Relative value analysis</span><h2>Infrastructure bonds - relative value</h2><p>Coupon and yield-to-maturity are separate fields. Spread/duration is an informal comparison heuristic, not OAS or a standard credit spread measure.</p></div><a className="source-link" href={data.sourceUrl} target="_blank" rel="noreferrer">Official source and license status</a></div>
    <div className="error-banner"><div><b>{data.sourceStatus==='pending'?'Bond market source pending':'Licensed bond source configured'}</b><p>{data.blocker}</p></div></div>
    <div className="inflation-stats"><div className="inflation-stat"><span>Fresh CPI-linked infrastructure bonds</span><b>{visible.filter(r=>r.linkageType==='cpi'&&!r.stale).length}</b></div><div className="inflation-stat"><span>Median real yield</span><b>{visible.filter(r=>r.linkageType==='cpi'&&!r.stale&&r.ytm!==null).length>=3?money(median(visible.filter(r=>r.linkageType==='cpi'&&!r.stale&&r.ytm!==null).map(r=>r.ytm!))):'?'}</b></div><div className="inflation-stat"><span>Median duration</span><b>{visible.filter(r=>r.linkageType==='cpi'&&!r.stale&&r.duration!==null).length>=3?money(median(visible.filter(r=>r.linkageType==='cpi'&&!r.stale&&r.duration!==null).map(r=>r.duration!))):'?'}</b></div><div className="inflation-stat"><span>Median spread</span><b>{visible.filter(r=>r.linkageType==='cpi'&&!r.stale&&r.spreadBp!==null).length>=3?`${money(median(visible.filter(r=>r.linkageType==='cpi'&&!r.stale&&r.spreadBp!==null).map(r=>r.spreadBp!)))} bp`:'?'}</b></div><div className="inflation-stat"><span>Median 5D spread change</span><b>{medianFresh(r=>r.spreadChange5dBp)===null?'?':`${money(medianFresh(r=>r.spreadChange5dBp),1)} bp`}</b></div><div className="inflation-stat"><span>Government / infrastructure near 5Y</span><b>{money(gov5)}% / {infra5.length>=3?`${money(median(infra5))}%`:'?'}</b></div><div className="inflation-stat"><span>Government / infrastructure near 10Y</span><b>{money(gov10)}% / {infra10.length>=3?`${money(median(infra10))}%`:'?'}</b></div></div>
    <div className="bond-filters"><label>Issuer<select value={issuer} onChange={e=>setIssuer(e.target.value)}><option value="">All metadata</option>{data.issuers.map(i=><option key={i.issuerKey} value={i.issuerKey}>{i.issuerNameHe}</option>)}</select></label><label>Linkage<select value={linkage} onChange={e=>setLinkage(e.target.value as 'cpi'|'nominal')}><option value="cpi">CPI-linked</option><option value="nominal">Nominal</option></select></label><label>From maturity<input type="date" value={minMaturity} onChange={e=>setMinMaturity(e.target.value)}/></label><label>To maturity<input type="date" value={maxMaturity} onChange={e=>setMaxMaturity(e.target.value)}/></label><label>Rating<input value={rating} onChange={e=>setRating(e.target.value)} placeholder="Exact agency grade"/></label><label>Min duration<input type="number" value={minDuration} onChange={e=>setMinDuration(e.target.value)}/></label><label>Max duration<input type="number" value={maxDuration} onChange={e=>setMaxDuration(e.target.value)}/></label><label>Minimum volume<input type="number" value={minVolume} onChange={e=>setMinVolume(e.target.value)}/></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value as keyof BondMarketRecord)}><option value="spreadBp">Credit spread</option><option value="duration">Duration</option><option value="ytm">Yield</option><option value="issuerNameHe">Issuer</option><option value="maturityDate">Maturity</option></select></label><label><input type="checkbox" checked={hideStale} onChange={e=>setHideStale(e.target.checked)}/> Hide stale quotes</label></div>
    <div className="two-column"><div className="panel"><h3>Yield versus duration ? {linkage==='cpi'?'real CPI-linked':'nominal'} only</h3>{chartRows.length>0 ? <ResponsiveContainer width="100%" height={260}><ScatterChart><CartesianGrid/><XAxis type="number" dataKey="duration" name="Duration" unit="y"/><YAxis type="number" dataKey="ytm" name="Yield to maturity" unit="%"/><Tooltip cursor={{strokeDasharray:'3 3'}}/>{data.issuers.map((issuer,index)=><Scatter key={issuer.issuerKey} name={issuer.issuerNameHe} data={chartRows.filter(r=>r.issuerKey===issuer.issuerKey)} fill={['#386f91','#987d54','#536f59','#7f638e','#63828b'][index%5]}/>)}</ScatterChart></ResponsiveContainer> : <div className="empty-chart">No verified quote observations are available for this chart.</div>}</div><div className="panel"><h3>Credit spread versus duration ? comparison only</h3>{chartRows.length>0 ? <ResponsiveContainer width="100%" height={260}><ScatterChart><CartesianGrid/><XAxis type="number" dataKey="duration" name="Duration" unit="y"/><YAxis type="number" dataKey="spreadBp" name="Spread" unit="bp"/><Tooltip cursor={{strokeDasharray:'3 3'}}/>{data.issuers.map((issuer,index)=><Scatter key={issuer.issuerKey} name={issuer.issuerNameHe} data={chartRows.filter(r=>r.issuerKey===issuer.issuerKey&&r.spreadBp!==null)} fill={['#386f91','#987d54','#536f59','#7f638e','#63828b'][index%5]}/>)}</ScatterChart></ResponsiveContainer> : <div className="empty-chart">No verified quote observations are available for this chart.</div>}</div></div>
    <p>Spread/duration (bp per year of duration) is an informal heuristic, not OAS, Z-spread, or a standardized credit measure.</p>
    <div style={{overflowX:'auto'}}><table className="bond-table"><thead><tr>{['Issuer','Series','Linkage','Coupon','YTM','Duration','Government benchmark','Benchmark yield','Spread bp','Daily 1D' ,'Weekly 5D' ,'bp / duration','Volume','Observation / quote age'].map(col=><th key={col} onClick={()=>setSort(sortKeys[col]??sort)} style={{cursor:'pointer'}} title={col==='Coupon'?'Coupon is contractual interest; yield to maturity also reflects market price.':col==='bp / duration'?'Informal comparison heuristic; not OAS or Z-spread.':undefined}>{col}</th>)}</tr></thead><tbody>{visible.map(r=><tr key={r.id} onClick={()=>setSelected(r)}><td>{r.issuerNameHe}</td><td>{r.seriesName}</td><td>{r.linkageType}</td><td>{money(r.couponRate)}%</td><td>{money(r.linkageType==='cpi'?(r.realYtm??r.ytm):(r.nominalYtm??r.ytm))}%</td><td>{money(r.duration)}</td><td>{r.benchmarkQuality}</td><td>{money(r.benchmarkYield)}%</td><td>{money(r.spreadBp,1)}</td><td>{money(r.spreadChange1dBp,1)}</td><td>{money(r.spreadChange5dBp,1)}</td><td>{money(r.spreadPerDuration,1)}</td><td>{r.tradingVolume??'?'}</td><td>{r.observationDate??'?'} ? {r.quoteAgeBusinessDays===null?'no quote':`${r.quoteAgeBusinessDays} business days`}{r.stale?' ? stale':''}{r.timestampMismatch?' ? timestamps differ; estimated spread':''}</td></tr>)}</tbody></table>{!visible.length&&<div className="empty-chart"><p>No verified bond quote data available.</p><span>Issuer metadata is not a market quote. No bonds are ranked or recommended.</span></div>}</div>
    {selected&&<BondDetailDrawer bond={selected} onClose={()=>setSelected(null)}/>}
  </section>;
}
function median(values:number[]):number|null { const sorted=[...values].sort((a,b)=>a-b); if(!sorted.length)return null; const m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2; }

function App() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MacroCard | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [apiState, setApiState] = useState<'checking' | 'connected' | 'unavailable'>('checking');

  async function loadData() {
    setLoading(true);
    setApiState('checking');
    const [healthResult, overviewResult] = await Promise.allSettled([getApiHealth(), getOverview()]);
    if (healthResult.status === 'fulfilled' && healthResult.value.ok && healthResult.value.database === 'reachable') {
      setApiState('connected');
    } else {
      setApiState('unavailable');
    }
    if (overviewResult.status === 'fulfilled') {
      const next = overviewResult.value;
      setData(next);
      setError(null);
      setUpdated(new Date());
    } else {
      const cause = overviewResult.reason;
      setApiState('unavailable');
      setError(cause instanceof Error ? cause.message : '×œ× × ×™×ª×Ÿ ×œ×”×ª×—×‘×¨ ×œ×©×™×¨×•×ª ×”× ×ª×•× ×™× ×”×ž×§×•×ž×™.');
    }
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);
  const signalByKey = useMemo(() => new Map(data?.signals.map((signal) => [signal.key, signal]) ?? []), [data?.signals]);


  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark">×©</div><div className="brand-copy"><b>×©×•×§ ×™×©×¨××œ</b><span>MONITOR Â· FIXED INCOME</span></div><nav className="top-nav" aria-label="× ×™×•×•×˜ ×¨××©×™"><a className="active" href="#overview">×¡×§×™×¨×”</a><a href="#curves">×¢×§×•× ×ž×ž×©×œ×ª×™</a><a href="#sources">×ž×§×•×¨×•×ª</a></nav><div className="top-actions"><div className={`api-connection api-${apiState}`} role="status" aria-live="polite"><span className="source-dot" />{apiState==='checking'?'×‘×•×“×§ ×—×™×‘×•×¨ ×œ×©×¨×ª':apiState==='connected'?'×”Ö¾API ×ž×—×•×‘×¨':'×”Ö¾API ××™× ×• ×–×ž×™×Ÿ'}</div><div className="market-open"><span className="market-pulse" />×ž×¢×§×‘ × ×ª×•× ×™×</div><button className="refresh-button" onClick={() => void loadData()} disabled={loading} aria-label="×¨×¢× ×•×Ÿ × ×ª×•× ×™×"><span className={loading ? 'spinning' : ''}>â†»</span>×¨×¢× ×•×Ÿ</button><div className="avatar">IL</div></div></header>

    <div className="content-wrap" id="overview">
      <section className="page-intro"><div><div className="breadcrumb">×™×©×¨××œ <span>/</span> ×ž××§×¨×• ×•×¨×™×‘×™×ª</div><h1>×©×•×§ ×”××’×´×— <span>×‘×ž×‘×˜ ×ž××§×¨×•</span></h1><p>×ª×ž×•× ×ª ×ž×¦×‘ ×©×§×•×¤×” ×©×œ ×¨×™×‘×™×ª, ××™× ×¤×œ×¦×™×” ×•×ª×©×•××•×ª ×ž×ž×©×œ×ª×™×•×ª</p></div><div className="as-of"><span className="as-of-icon">â—·</span><div><small>×‘×“×™×§×ª × ×ª×•× ×™× ××—×¨×•× ×”</small><b>{updated ? dateLabel(updated.toISOString()) : '×ž×ª×—×‘×¨ ×œ×ž×§×•×¨×•×ª'}</b></div></div></section>

      {error && <div className="error-banner" role="alert"><span>!</span><div><b>{data?'×”×©×¨×ª ××™× ×• ×–×ž×™×Ÿ â€” ×ž×•×¦×’×ª ×”×ª×¦×¤×™×ª ×”×ª×§×™× ×” ×”××—×¨×•× ×”':'×œ× × ×™×ª×Ÿ ×œ×˜×¢×•×Ÿ × ×ª×•× ×™×'}</b><p>{error}</p></div><button onClick={() => void loadData()}>×œ× ×¡×•×ª ×©×•×‘</button></div>}

      <section className="regime-panel" aria-labelledby="regime-title">
        <div className="regime-main"><div className="regime-icon">â—ˆ</div><div className="regime-copy"><div className="eyebrow">×ª×ž×•× ×ª ×ž×¦×‘ Â· ×™×©×¨××œ</div><h2 id="regime-title">{data ? ({ green: '×¡×‘×™×‘×” ×ª×•×ž×›×ª ×‘×™×¨×™×“×ª ×ª×©×•××•×ª', yellow: '×¡×‘×™×‘×” ×ž×¢×•×¨×‘×ª', red: '×¡×‘×™×‘×” ×ª×•×ž×›×ª ×‘×¢×œ×™×™×ª ×ª×©×•××•×ª', unknown: '×ž×ž×ª×™×Ÿ ×œ× ×ª×•× ×™ ×©×•×§' } as const)[data.regime.status] : '×ž×ª×—×‘×¨ ×œ× ×ª×•× ×™×'}</h2><p>×ž×“×“×™× ×ª×™××•×¨×™×™× ×‘×œ×‘×“ â€” ×œ× ×”×ž×œ×¦×ª ×”×©×§×¢×” ×•×œ× ×ª×—×–×™×ª ×œ×ª×©×•××”.</p></div></div>
        <div className="regime-stats"><div className="regime-stat"><b>{data?.regime.green ?? 'â€”'}</b><span><i className="dot-green" />×—×™×•×‘×™×™×</span></div><div className="regime-stat"><b>{data?.regime.yellow ?? 'â€”'}</b><span><i className="dot-yellow" />×ž×¢×•×¨×‘×™×</span></div><div className="regime-stat"><b>{data?.regime.red ?? 'â€”'}</b><span><i className="dot-red" />×©×œ×™×œ×™×™×</span></div><div className="confidence-stat"><span>×©×œ×ž×•×ª ×•××—×™×“×•×ª × ×ª×•× ×™×</span><b>{data?.regime.confidence ?? '×ž×ž×ª×™×Ÿ'}</b><div className="confidence-meter"><i style={{ width: data ? `${data.regime.coveragePct}%` : '0%' }} /></div></div></div>
        <div className="regime-foot"><span>×ž×©×•×§×œ×œ ×œ×¤×™ ×”×’×“×¨×•×ª ×ž×¨×›×–×™×•×ª Â· ×ž×™×“×¢ ×—×¡×¨ ××™× ×• × ×—×©×‘ × ×™×˜×¨×œ×™</span><span>×¢×“×›×•×Ÿ: {dateLabel(data?.generatedAt)}</span></div>
      </section>

      <div className="section-heading"><div><span className="eyebrow">×ž× ×•×¢ ××™×ª×•×ª×™× Â· ×©×§×•×£ ×•×ž×ª×•×¢×“</span><h2>×©×©×ª ×ž×“×“×™ ×”×œ×™×‘×”</h2></div><span className="heading-note"><span className="info-mark">i</span>×œ×—×™×¦×” ×¢×œ ×›×¨×˜×™×¡ ×ž×¦×™×’×” ××ª ×›×œ×œ ×”×¡×™×•×•×’ ×•×”×ž×§×•×¨</span></div>
      <section className="cards-grid" aria-label="×©×©×ª ×ž×“×“×™ ×”×œ×™×‘×”">{data?.cards.map((card) => <MacroCardView key={card.key} card={card} onOpen={setSelected} />) ?? Array.from({ length: 6 }, (_, index) => <div className="card-skeleton" key={index}><span /><i /><b /><small /></div>)}</section>

      <section className="panel"><div className="panel-title"><div><span className="eyebrow">Global market context</span><h2>USD/ILS, U.S. yields and real-yield spread</h2></div></div><div className="inflation-stats">{data && [data.markets.usdIls,data.markets.us10yNominal,data.markets.us10yReal,data.markets.realYieldDifferential].map(series=><div className="inflation-stat" key={series.key}><span>{series.key}</span><b>{numberLabel(series.value)} {series.unit}</b><small>{series.observationDate ?? 'Pending source'} | {series.source}</small></div>)}</div><p>BOI representative FX is an indicative fixing. The IL-US real-yield spread compares yields; it is not CDS.</p><div className="inflation-stats">{data && [data.markets.usdIls,data.markets.us10yNominal,data.markets.us10yReal,data.markets.realYieldDifferential].map(series=><div className="inflation-stat" key={`${series.key}-changes`}><span>Available changes</span><small>{Object.entries(series.changes).map(([key,value])=>`${key}: ${value===null?"none":numberLabel(value,2)}`).join(" ? ")}</small><small>Source URL: <a href={series.sourceUrl} target="_blank" rel="noreferrer">{series.source}</a> | status: {series.status}</small></div>)}</div><p>{data?.markets.riskProxy.label}: {data?.markets.riskProxy.components.map(component=>`${component.key} ${component.value===null?"none":numberLabel(component.value,2)} ${component.unit} (${component.status}, ${component.sourceObservationDate??"no date"})`).join(" ? ")}</p></section>
      <section className="panel"><div className="panel-title"><div><span className="eyebrow">Bank of Israel publication</span><h2>Inflation expectations</h2></div><span>{dateLabel(data?.expectations.publicationDate)}</span></div><div className="inflation-stats">{data?.expectations.items.map(series=><div className="inflation-stat" key={series.key}><span>{series.key}</span><b>{series.value===null?'Pending source':`${numberLabel(series.value)}%`}</b><small>{dateLabel(series.observationDate)} | {series.source}</small></div>)}</div></section>
      {data && <BondScreener data={data.bondScreener} governmentCurves={data.curves} />}
      <section className="two-column" id="curves"><YieldCurvePanel real={data?.curves.real ?? []} nominal={data?.curves.nominal ?? []} /><InflationPanel data={data?.inflation ?? { latestIndex: null, mom: null, yoy: null, previousYoy: null, observationDate: null, targetLow: 1, targetHigh: 3, observations: [] }} /></section>

      <section className="panel"><div className="panel-title"><div><span className="eyebrow">Daily persisted snapshots</span><h2>Regime history</h2></div></div><RegimeHistoryChart rows={data?.regimeHistory ?? []}/><div className="source-list">{data?.regimeHistory.map(row=><div className="source-row" key={row.date}><span>{row.date}</span><b>{row.status} ? score {numberLabel(row.score,3)} ? coverage {numberLabel(row.coveragePct,0)}%</b><span>green {row.green} / yellow {row.yellow} / red {row.red} ? positive: {row.topPositive ?? "none"} ? negative: {row.topNegative ?? "none"}</span></div>)}</div></section>

      <section className="change-panel"><div className="change-icon">â†—</div><div><span className="eyebrow">×¢×“×›×•×Ÿ ×ž×‘×•×¡×¡ ×ª×¦×¤×™×•×ª</span><h2>×ž×” ×”×©×ª× ×”?</h2><p>{data ? (data.changes.bullets.join(" ") || data.changes.summary) : '×ª×™××•×¨ ×”×©×™× ×•×™×™× ×™×•×¤×™×¢ ×œ××—×¨ ×˜×¢×™× ×ª × ×ª×•× ×™× ×ž××•×ž×ª×™×.'}</p></div><div className="change-sources"><span>×§×œ×˜×™×:</span>{data?.cards.filter((card) => card.value !== null).map((card) => <span className="change-chip" key={card.key}>{card.title}</span>)}</div></section>

      <section className="duration-strip"><div><span className="eyebrow">×¨×’×™×©×•×ª ×œ×¤×™ ×ž×—×´×ž</span><h2>×©×œ×•×©×” ××•×¤×§×™ ×ž×¢×§×‘</h2></div><div className="duration-bucket"><b>×§×¦×¨ Â· 0â€“3 ×©× ×™×</b><span>×¨×™×‘×™×ª ×‘× ×§ ×™×©×¨××œ ×•××™× ×¤×œ×¦×™×” ×§×¨×•×‘×”</span><i>×ª×™××•×¨ ×¨×’×™×©×•×ª</i></div><div className="duration-bucket"><b>×‘×™× ×•× ×™ Â· 3â€“7 ×©× ×™×</b><span>×ž×¡×œ×•×œ ×”×¨×™×‘×™×ª ×•×¦×™×¤×™×•×ª ×”××™× ×¤×œ×¦×™×”</span><i>×ª×™××•×¨ ×¨×’×™×©×•×ª</i></div><div className="duration-bucket"><b>××¨×•×š Â· 7+ ×©× ×™×</b><span>×ª×©×•××” ×¨×™××œ×™×ª, ×¡×™×›×•×Ÿ ×ž×“×™× ×” ×•×”×™×¦×¢</span><i>×ª×™××•×¨ ×¨×’×™×©×•×ª</i></div></section>

      <section className="sources-layout" id="sources"><div className="sources-note"><span className="eyebrow">×ž×§×•×¨×•×ª ×¨××©×•× ×™×™×</span><h2>× ×ª×•× ×™× ×œ×¤× ×™ ×¤×¨×©× ×•×ª</h2><p>×”×¢×¨×›×™× ×ž×•×¦×’×™× ×™×—×“ ×¢× ×ž×§×•×¨×, ×ž×•×¢×“ ×”×ª×¦×¤×™×ª ×•×¢×“×›×•×Ÿ ×”×§×œ×™×˜×”. × ×ª×•×Ÿ ×—×¡×¨ ××• ×ž×™×•×©×Ÿ ××™× ×• ×ž×§×‘×œ ×¦×‘×¢ ×›×™×•×•×Ÿ.</p><div className="source-legend"><span><i className="source-dot source-ok" />× ×ª×•×Ÿ ×¢×“×›× ×™</span><span><i className="source-dot source-stale" />× ×“×¨×© ×¢×“×›×•×Ÿ</span><span><i className="source-dot source-pending" />×˜×¨× ×—×•×‘×¨</span></div></div><SourceStatusPanel sources={data?.sources ?? []} /></section>

      <footer className="footer"><div><b>×©×•×§ ×™×©×¨××œ</b><span>×œ×•×— ×ž××§×¨×• ×•×¨×™×‘×™×ª Â· ×’×¨×¡×ª ×œ×™×‘×”</span></div><p>×”×ž×™×“×¢ ×ª×™××•×¨×™ ×•×ž×‘×•×¡×¡ ×ž×§×•×¨×•×ª ×¨×©×ž×™×™×. ××™×Ÿ ×œ×¨××•×ª ×‘×• ×™×™×¢×•×¥, ××™×ª×•×ª ×ž×¡×—×¨ ××• ×”×ž×œ×¦×” ×œ×¤×¢×•×œ×”.</p><span>RTL Â· Asia/Jerusalem</span></footer>
    </div>

    {selected && <DetailDrawer card={selected} signal={signalByKey.get(selected.key)} onClose={() => setSelected(null)} />}
  </main>;
}

export default App;
