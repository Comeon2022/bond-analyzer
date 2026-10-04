import type { BondMarketRecord } from './bonds';
export type SignalStatus = 'green' | 'yellow' | 'red' | 'unknown';

export interface Observation {
  observationDate: string;
  value: number;
  ingestedAt: string;
  sourceTimestamp: string | null;
  revisionNumber?: number;
}

export interface Signal {
  key: string;
  nameHe: string;
  status: SignalStatus;
  score: number | null;
  value: Record<string, number | string | null>;
  explanationHe: string;
  observationDate: string | null;
  weight: number;
}

export interface MacroCard {
  key: string;
  title: string;
  value: number | null;
  previousValue: number | null;
  change: number | null;
  unit: string;
  status: SignalStatus;
  explanation: string;
  observedAt: string | null;
  source: string;
  sourceUrl: string;
  sourceUrls?: string[];
  history: Observation[];
  pending: boolean;
  details: Record<string, number | string | null>;
}

export interface YieldPoint {
  date: string;
  tenorYears: number;
  value: number;
  ingestedAt?: string;
  sourceTimestamp?: string | null;
  revisionNumber?: number;
}

export interface SourceStatus {
  key: string;
  name: string;
  url: string;
  status: 'ok' | 'stale' | 'error' | 'pending';
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  failureKind?: 'unavailable' | 'timeout' | 'malformed' | null;
  checkedAt?: string | null;
  observationDate: string | null;
  observationValue: number | null;
}

export interface MarketSeries {
  key: string;
  value: number | null;
  unit: string;
  observationDate: string | null;
  sourceTimestamp: string | null;
  source: string;
  sourceUrl: string;
  status: SourceStatus['status'];
  changes: Record<string, number | null>;
  history: Observation[];
  ingestedAt?: string | null;
  revisionNumber?: number | null;
  derived?: boolean;
  provenance?: string;
  sourceUrls?: string[];
}

export interface RiskComponent {
  key: string;
  value: number | null;
  unit: string;
  normalizedScore: number | null;
  status: SignalStatus;
  sourceObservationDate: string | null;
  source: string;
  sourceUrls: string[];
  provenance: string;
}

export interface RiskProxy {
  value: number | null;
  status: SignalStatus;
  label: 'פרוקסי תנאי הסיכון בישראל';
  source: string;
  sourceUrls: string[];
  provenance: string;
  components: RiskComponent[];
  coverage: number;
  explanationHe: string;
}

export interface ChangeSummary {
  bullets: string[];
  summary: string;
}

export interface OverviewResponse {
  generatedAt: string;
  regime: { status: SignalStatus; score: number | null; coveragePct: number; green: number; yellow: number; red: number; unknown: number; confidence: string; reasons: string[] };
  cards: MacroCard[];
  signals: Signal[];
  inflation: { latestIndex: number | null; mom: number | null; yoy: number | null; previousYoy: number | null; observationDate: string | null; targetLow: number; targetHigh: number; observations: Observation[] };
  curves: { real: YieldPoint[]; nominal: YieldPoint[] };
  sources: SourceStatus[];
  expectations: { items: MarketSeries[]; publicationDate: string | null };
  markets: { usdIls: MarketSeries; us2yNominal: MarketSeries; us10yNominal: MarketSeries; us10yReal: MarketSeries; us10yBreakeven: MarketSeries; us2s10s: MarketSeries; realYieldDifferential: MarketSeries; riskProxy: RiskProxy };
  changes: ChangeSummary;
  bondScreener: { sourceStatus: 'pending' | 'configured'; sourceUrl: string; blocker: string; issuers: Array<{issuerKey:string;issuerNameHe:string;issuerNameEn:string;issuerGroup:string}>; rows: BondMarketRecord[] };
  regimeHistory: Array<{ date: string; score: number | null; coveragePct: number; status: SignalStatus; green: number; yellow: number; red: number; topPositive: string | null; topNegative: string | null }>;
}
