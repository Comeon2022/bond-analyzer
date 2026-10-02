export type LinkageType = 'cpi' | 'nominal';
export type BenchmarkQuality = 'exact_duration' | 'interpolated' | 'maturity_interpolated' | 'nearest_bond_fallback' | 'unavailable';
export interface GovernmentCurvePoint { tenorYears:number; yieldPercent:number; }
export interface BondMarketRecord {
 id:string; issuerKey:string; issuerNameHe:string; seriesName:string; securityId:string|null; linkageType:LinkageType;
 couponRate:number|null; maturityDate:string|null; nextPrincipalDate:string|null; finalPrincipalDate:string|null;
 cleanPrice:number|null; dirtyPrice:number|null; ytm:number|null; realYtm?:number|null; nominalYtm?:number|null; duration:number|null; modifiedDuration:number|null;
 outstandingAmount:number|null; rating:string|null; ratingAgency:string|null; ratingDate:string|null; collateralSummary:string|null;
 tradingVolume:number|null; lastTradeAt:string|null; observationDate:string|null; observedAt:string|null; sourceUrl:string|null;
 benchmarkYield:number|null; benchmarkTenor:number|null; benchmarkQuality:BenchmarkQuality; spreadBp:number|null; spreadPerDuration:number|null;
 spreadChange1dBp:number|null; spreadChange5dBp:number|null; spreadChange20dBp:number|null; spreadChange60dBp:number|null;
 quoteAgeBusinessDays:number|null; stale:boolean; timestampMismatch:boolean;
}
export interface BondFilters { issuer?:string; linkage?:LinkageType; minDuration?:number; maxDuration?:number; minMaturity?:string; maxMaturity?:string; rating?:string; minVolume?:number; hideStale?:boolean; }
export function matchGovernmentBenchmark(linkage:LinkageType,duration:number|null,maturityYears:number|null,curves:Record<LinkageType,GovernmentCurvePoint[]>):{yieldPercent:number|null;tenorYears:number|null;quality:BenchmarkQuality} {
 const sorted=[...curves[linkage]].filter(p=>Number.isFinite(p.tenorYears)&&Number.isFinite(p.yieldPercent)).sort((a,b)=>a.tenorYears-b.tenorYears);
 if(!sorted.length) return {yieldPercent:null,tenorYears:null,quality:'unavailable'};
 const target=duration??maturityYears; if(target===null||!Number.isFinite(target)||target<=0) return {yieldPercent:null,tenorYears:null,quality:'unavailable'};
 const exact=sorted.find(p=>Math.abs(p.tenorYears-target)<1e-8);
 if(exact) return {yieldPercent:exact.yieldPercent,tenorYears:exact.tenorYears,quality:duration===null?'maturity_interpolated':'exact_duration'};
 const low=sorted.filter(p=>p.tenorYears<target).at(-1),high=sorted.find(p=>p.tenorYears>target);
 if(low&&high){const y=low.yieldPercent+(target-low.tenorYears)/(high.tenorYears-low.tenorYears)*(high.yieldPercent-low.yieldPercent);return {yieldPercent:y,tenorYears:target,quality:duration===null?'maturity_interpolated':'interpolated'};}
 const nearest=sorted.reduce((a,b)=>Math.abs(b.tenorYears-target)<Math.abs(a.tenorYears-target)?b:a);
 return {yieldPercent:nearest.yieldPercent,tenorYears:nearest.tenorYears,quality:'nearest_bond_fallback'};
}
export function creditSpreadBp(bondYield:number|null,benchmarkYield:number|null):number|null {return bondYield===null||benchmarkYield===null||!Number.isFinite(bondYield)||!Number.isFinite(benchmarkYield)?null:(bondYield-benchmarkYield)*100;}
export function spreadPerDuration(spreadBp:number|null,duration:number|null):number|null {return spreadBp===null||duration===null||!Number.isFinite(duration)||duration<=0?null:spreadBp/duration;}
export function quoteAgeBusinessDays(observationDate:string|null,asOf=new Date()):number|null {
 if(!observationDate||!/^\d{4}-\d{2}-\d{2}$/.test(observationDate)) return null;
 const start=new Date(`${observationDate}T00:00:00Z`); if(Number.isNaN(start.valueOf())||start>asOf) return null;
 let count=0; const end=new Date(Date.UTC(asOf.getUTCFullYear(),asOf.getUTCMonth(),asOf.getUTCDate())); const d=new Date(start); d.setUTCDate(d.getUTCDate()+1); for(;d<=end;d.setUTCDate(d.getUTCDate()+1)){const day=d.getUTCDay();if(day!==0&&day!==6)count++;} return count;
}
export function applyBondFilters(rows:BondMarketRecord[],filters:BondFilters):BondMarketRecord[]{return rows.filter(r=>(!filters.issuer||r.issuerKey===filters.issuer)&&(!filters.linkage||r.linkageType===filters.linkage)&&(filters.minDuration===undefined||(r.duration??-Infinity)>=filters.minDuration)&&(filters.maxDuration===undefined||(r.duration??Infinity)<=filters.maxDuration)&&(!filters.minMaturity||(r.maturityDate??'')>=filters.minMaturity)&&(!filters.maxMaturity||(r.maturityDate??'')<=filters.maxMaturity)&&(!filters.rating||r.rating===filters.rating)&&(filters.minVolume===undefined||(r.tradingVolume??-Infinity)>=filters.minVolume)&&(!filters.hideStale||!r.stale));}
