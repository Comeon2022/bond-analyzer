PRAGMA foreign_keys = ON;

INSERT INTO data_sources (id,key,name,base_url,source_type,is_official,last_error_message) VALUES
 ('tase_bonds','tase_bonds','Tel Aviv Stock Exchange bond products','https://www.tase.co.il','licensed_market_data',1,'Pending TASE DATA HUB account, product entitlement and API key; no market observations ingested.');

CREATE TABLE bond_issuers (
 issuer_key TEXT PRIMARY KEY,
 issuer_name_he TEXT NOT NULL,
 issuer_name_en TEXT NOT NULL,
 issuer_group TEXT NOT NULL,
 metadata_source TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO bond_issuers (issuer_key,issuer_name_he,issuer_name_en,issuer_group,metadata_source) VALUES
 ('government',char(1502,1493,1493,1503,32,1497,1513,1512,1488,1500),'Government of Israel','government','Phase 1C specification; metadata only'),
 ('ports',char(1495,1489,1512,1514,32,1504,1502,1500,1497,32,1497,1513,1512,1488,1500),'Israel Ports Company','infrastructure','Phase 1C specification; metadata only'),
 ('iec',char(1495,1489,1512,1514,32,1492,1495,1513,1502,1500),'Israel Electric Corporation','infrastructure','Phase 1C specification; metadata only'),
 ('mekorot',char(1502,1511,1493,1512,1493,1514),'Mekorot','infrastructure','Phase 1C specification; metadata only'),
 ('ingl',char(1504,1514,1497,1489,1497,32,1490,1494),'Israel Natural Gas Lines','infrastructure','Phase 1C specification; metadata only');

CREATE TABLE bond_master (
 id TEXT PRIMARY KEY,
 issuer_key TEXT NOT NULL REFERENCES bond_issuers(issuer_key),
 series_name TEXT NOT NULL,
 security_id TEXT,
 linkage_type TEXT CHECK (linkage_type IN ('cpi','nominal')),
 coupon_rate REAL,
 maturity_date TEXT,
 next_principal_date TEXT,
 final_principal_date TEXT,
 currency TEXT,
 outstanding_amount REAL,
 rating TEXT,
 rating_agency TEXT,
 rating_date TEXT,
 collateral_summary TEXT,
 metadata_source TEXT,
 metadata_source_url TEXT,
 is_active INTEGER,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX idx_bond_master_issuer ON bond_master(issuer_key,linkage_type,is_active);

CREATE TABLE bond_market_observations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 bond_id TEXT NOT NULL REFERENCES bond_master(id),
 observation_date TEXT NOT NULL,
 observed_at TEXT,
 clean_price REAL,
 dirty_price REAL,
 ytm REAL,
 real_ytm REAL,
 nominal_ytm REAL,
 duration REAL,
 modified_duration REAL,
 trading_volume REAL,
 last_trade_at TEXT,
 source_id TEXT NOT NULL REFERENCES data_sources(id),
 source_url TEXT,
 payload_hash TEXT NOT NULL,
 revision INTEGER NOT NULL,
 ingested_at TEXT NOT NULL,
 UNIQUE(bond_id,observation_date,revision)
);
CREATE INDEX idx_bond_observations_latest ON bond_market_observations(bond_id,observation_date DESC,revision DESC);
CREATE VIEW latest_bond_market_observations AS SELECT o.* FROM bond_market_observations o WHERE o.revision=(SELECT MAX(x.revision) FROM bond_market_observations x WHERE x.bond_id=o.bond_id AND x.observation_date=o.observation_date);

CREATE TABLE bond_benchmark_observations (
 bond_id TEXT NOT NULL REFERENCES bond_master(id),
 observation_date TEXT NOT NULL,
 benchmark_curve TEXT NOT NULL CHECK(benchmark_curve IN ('real','nominal')),
 benchmark_duration REAL,
 benchmark_yield REAL,
 matching_method TEXT NOT NULL,
 spread_bp REAL,
 spread_per_duration REAL,
 calculation_version TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(bond_id,observation_date,calculation_version)
);
CREATE TABLE bond_ratings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 bond_id TEXT NOT NULL REFERENCES bond_master(id),
 agency TEXT NOT NULL,
 rating TEXT NOT NULL,
 outlook TEXT,
 rating_date TEXT,
 source_url TEXT NOT NULL,
 ingested_at TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 revision INTEGER NOT NULL,
 UNIQUE(bond_id,agency,rating_date,revision)
);

INSERT INTO dashboard_settings(key,value_json,description) VALUES
 ('bond_quote_stale_business_days','3','Bond market quote freshness threshold in business days.'),
 ('bond_spread_change_threshold_bp','5','Minimum absolute bond spread move, in bp, for deterministic bond change bullets.'),
 ('bond_market_data_enabled','0','Enable only after TASE market data license and API entitlement are configured.');

CREATE TABLE bond_cashflows (
 bond_id TEXT NOT NULL REFERENCES bond_master(id),
 payment_date TEXT NOT NULL,
 coupon_amount REAL,
 principal_percentage REAL,
 source_url TEXT NOT NULL,
 ingested_at TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 revision INTEGER NOT NULL,
 PRIMARY KEY(bond_id,payment_date,revision)
);
