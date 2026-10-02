import type { BondMarketRecord } from '../../shared/bonds';
import type { OverviewResponse, Observation, YieldPoint, Signal, MarketSeries, RiskProxy, ChangeSummary } from '../../shared/types';

export type { OverviewResponse, Observation, YieldPoint, Signal, MarketSeries, RiskProxy, ChangeSummary };

export interface BondHistoryPoint {
  observationDate: string;
  observedAt: string;
  cleanPrice: number | null;
  dirtyPrice: number | null;
  ytm: number | null;
  realYtm: number | null;
  nominalYtm: number | null;
  duration: number | null;
  modifiedDuration: number | null;
  tradingVolume: number | null;
  lastTradeAt: string | null;
  sourceUrl: string | null;
  revision: number;
  ingestedAt: string;
}

export interface BondHistoryResponse {
  bondId: string;
  observations: BondHistoryPoint[];
}

export interface BondBenchmarkPoint {
  observation_date: string;
  benchmark_yield: number | null;
  spread_bp: number | null;
  spread_per_duration: number | null;
  matching_method: string;
}

export interface BondBenchmarkResponse {
  bondId: string;
  observations: BondBenchmarkPoint[];
}

export interface BondDetailResponse {
  bond: BondMarketRecord | null;
  cashflows: Array<{ paymentDate: string; couponAmount: number | null; principalPercentage: number | null }>;
}

export interface BondListResponse {
  total: number;
  page: number;
  pageSize: number;
  bonds: BondMarketRecord[];
}

export interface CreditSpreadPoint { timePeriod: string; value: number; releaseStatus: string | null; ingestedAt?: string; revision?: number; }
export interface CreditSpreadSeries {
  seriesCode: string;
  label: string;
  frequency: string | null;
  compCategoryCode: string | null;
  compCategoryLabel: string | null;
  compNameCode: string | null;
  compNameLabel: string | null;
  indexationTypeCode: string | null;
  indexationTypeLabel: string | null;
  secRankGroupCode: string | null;
  secRankGroupLabel: string | null;
  issuerSectorCode: string | null;
  issuerSectorLabel: string | null;
  unitMeasure: string | null;
  unitMeasureLabel: string | null;
  source: string;
  sourceUrl: string;
  latest: { timePeriod: string; value: number; releaseStatus: string | null } | null;
  latestObservationPeriod: string | null;
  change1m: number | null;
  change3m: number | null;
  change12m: number | null;
  stale: boolean;
  metadataResolved: number;
  history: CreditSpreadPoint[];
}
export interface CreditSourceStatus {
  name: string;
  sourceUrl: string;
  sourcePage: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  latestObservationPeriod: string | null;
  observationCount: number;
  seriesCount: number;
  stale: boolean;
  status: 'pending' | 'stale' | 'error' | 'healthy';
}
export interface CreditSpreadsResponse { series: CreditSpreadSeries[]; sourceStatus: CreditSourceStatus; source: string; dataflow: string; }
export interface CreditSummaryResponse {
  seriesCount: number;
  latestCommonObservationPeriod: string | null;
  widestCurrentSpread: { seriesCode: string; label: string; value: number; timePeriod: string } | null;
  narrowestCurrentSpread: { seriesCode: string; label: string; value: number; timePeriod: string } | null;
  largest3mWidening: { seriesCode: string; label: string; changeBp: number | null } | null;
  largest3mNarrowing: { seriesCode: string; label: string; changeBp: number | null } | null;
  coverage: { seriesWithData: number; seriesWithoutData: number; metadataResolvedSeries: number; metadataUnresolvedSeries: number };
  sourceStatus: CreditSourceStatus;
  changes: { bullets: string[] };
}
