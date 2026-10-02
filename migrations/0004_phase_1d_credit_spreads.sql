PRAGMA foreign_keys = ON;

INSERT INTO data_sources (id,key,name,base_url,source_type,is_official)
VALUES ('boi_credit_spreads','boi_credit_spreads','BOI SECDWH corporate spreads','https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/SECDWH/1.0/','official_aggregate_statistics',1)
ON CONFLICT(key) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,source_type=excluded.source_type,is_official=1,enabled=1,updated_at=CURRENT_TIMESTAMP;

CREATE TABLE credit_metadata_cache (
  codelist_id TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  entries_json TEXT NOT NULL
);

CREATE TABLE credit_spread_series (
  series_code TEXT PRIMARY KEY,
  frequency TEXT,
  comp_category_code TEXT,
  comp_category_label TEXT,
  comp_name_code TEXT,
  comp_name_label TEXT,
  indexation_type_code TEXT,
  indexation_type_label TEXT,
  sec_rank_group_code TEXT,
  sec_rank_group_label TEXT,
  issuer_sector_code TEXT,
  issuer_sector_label TEXT,
  unit_measure TEXT,
  unit_measure_label TEXT,
  source TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE credit_spread_observations (
  series_code TEXT NOT NULL REFERENCES credit_spread_series(series_code),
  time_period TEXT NOT NULL,
  observation_value REAL NOT NULL,
  release_status TEXT,
  payload_hash TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  PRIMARY KEY(series_code,time_period,revision_number),
  UNIQUE(series_code,time_period,payload_hash)
);
CREATE INDEX idx_credit_spreads_period ON credit_spread_observations(series_code,time_period DESC,revision_number DESC);

CREATE VIEW latest_credit_spread_observations AS
SELECT o.* FROM credit_spread_observations o
WHERE o.revision_number=(SELECT MAX(latest.revision_number) FROM credit_spread_observations latest WHERE latest.series_code=o.series_code AND latest.time_period=o.time_period);
