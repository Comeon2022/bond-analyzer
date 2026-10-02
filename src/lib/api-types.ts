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
