PRAGMA foreign_keys = ON;

CREATE TABLE data_sources (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  is_official INTEGER NOT NULL DEFAULT 1 CHECK (is_official IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_success_at TEXT,
  last_error_at TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE macro_series (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name_he TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  frequency TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES data_sources(id),
  source_series_code TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  stale_after_hours INTEGER NOT NULL,
  min_plausible REAL,
  max_plausible REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE macro_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id TEXT NOT NULL REFERENCES macro_series(id),
  observation_date TEXT NOT NULL,
  value REAL NOT NULL,
  source_timestamp TEXT,
  ingested_at TEXT NOT NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  raw_payload_hash TEXT,
  UNIQUE (series_id, observation_date, revision_number)
);
CREATE INDEX idx_macro_observations_series_date ON macro_observations(series_id, observation_date DESC, revision_number DESC);

CREATE VIEW latest_macro_observations AS
SELECT o.* FROM macro_observations o
WHERE o.revision_number = (
  SELECT MAX(latest.revision_number) FROM macro_observations latest
  WHERE latest.series_id = o.series_id AND latest.observation_date = o.observation_date
);

CREATE TABLE yield_curve_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  curve_type TEXT NOT NULL CHECK (curve_type IN ('nominal', 'real')),
  tenor_years REAL NOT NULL,
  observation_date TEXT NOT NULL,
  value REAL NOT NULL,
  source_timestamp TEXT,
  ingested_at TEXT NOT NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  raw_payload_hash TEXT NOT NULL,
  UNIQUE (curve_type, tenor_years, observation_date, revision_number)
);
CREATE INDEX idx_yield_curve_date ON yield_curve_observations(curve_type, tenor_years, observation_date DESC, revision_number DESC);

CREATE VIEW latest_yield_curve_observations AS
SELECT o.* FROM yield_curve_observations o
WHERE o.revision_number = (
  SELECT MAX(latest.revision_number) FROM yield_curve_observations latest
  WHERE latest.curve_type = o.curve_type AND latest.tenor_years = o.tenor_years AND latest.observation_date = o.observation_date
);

CREATE TABLE signal_definitions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name_he TEXT NOT NULL,
  description_he TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0,
  green_rule_json TEXT NOT NULL,
  yellow_rule_json TEXT NOT NULL,
  red_rule_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE signal_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_key TEXT NOT NULL REFERENCES signal_definitions(key),
  observation_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('green', 'yellow', 'red', 'unknown')),
  score REAL,
  value_json TEXT NOT NULL,
  explanation_he TEXT NOT NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  raw_payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (signal_key, observation_date, revision_number)
);
CREATE INDEX idx_signal_snapshots_date ON signal_snapshots(signal_key, observation_date DESC, revision_number DESC);
CREATE VIEW latest_signal_snapshots AS
SELECT s.* FROM signal_snapshots s
WHERE s.revision_number = (
  SELECT MAX(latest.revision_number) FROM signal_snapshots latest
  WHERE latest.signal_key = s.signal_key AND latest.observation_date = s.observation_date
);

CREATE TABLE dashboard_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ingestion_runs (
  id TEXT PRIMARY KEY,
  job_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'error')),
  records_read INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  details_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_ingestion_runs_job_started ON ingestion_runs(job_key, started_at DESC);

INSERT INTO data_sources (id, key, name, base_url, source_type, is_official) VALUES
  ('boi', 'bank_of_israel', 'בנק ישראל', 'https://www.boi.org.il', 'official_api', 1),
  ('cbs', 'israel_cbs', 'הלשכה המרכזית לסטטיסטיקה', 'https://api.cbs.gov.il', 'official_api', 1);

INSERT INTO macro_series (id, key, name_he, name_en, category, unit, frequency, source_id, source_series_code, stale_after_hours, min_plausible, max_plausible) VALUES
  ('boi_policy_rate', 'boi_policy_rate', 'ריבית בנק ישראל', 'Bank of Israel policy rate', 'rates', '%', 'daily_snapshot', 'boi', 'PublicApi/GetInterest.currentInterest', 1080, 0, 30),
  ('cpi_index', 'cpi_index', 'מדד המחירים לצרכן', 'Consumer Price Index', 'inflation', 'index', 'monthly', 'cbs', '120010', 1200, 0, NULL),
  ('real_yield_10y', 'real_yield_10y', 'תשואה ריאלית ממשלתית ל-10 שנים', '10Y real government yield', 'government_yields', '%', 'twice_monthly', 'boi', 'shcd07_e.xls', 1080, -20, 40),
  ('nominal_yield_10y', 'nominal_yield_10y', 'תשואה נומינלית ממשלתית ל-10 שנים', '10Y nominal government yield', 'government_yields', '%', 'twice_monthly', 'boi', 'shcd08_e.xls', 1080, -20, 50);

INSERT INTO signal_definitions (id, key, name_he, description_he, weight, green_rule_json, yellow_rule_json, red_rule_json) VALUES
  ('policy_rate', 'policy_rate', 'ריבית בנק ישראל', 'הריבית הקצרה משפיעה על עקום התשואות אך אינה קובעת מכנית תשואות ארוכות.', 0.15, '{"rule":"falling_60d"}', '{"rule":"stable_or_mixed"}', '{"rule":"rising_60d"}'),
  ('cpi_inflation', 'cpi_inflation', 'אינפלציה', 'שינוי מדד המחירים לצרכן והשינוי השנתי המחושב ממנו.', 0.15, '{"rule":"falling_and_target"}', '{"rule":"inside_target_mixed"}', '{"rule":"rising_or_above_target"}'),
  ('inflation_expectations', 'inflation_expectations', 'ציפיות אינפלציה', 'מקור סדרת ציפיות השוק טרם הוגדר ונבדק.', 0.15, '{"rule":"source_pending"}', '{"rule":"source_pending"}', '{"rule":"source_pending"}'),
  ('israel_risk_proxy', 'israel_risk_proxy', 'פרמיית סיכון ישראל', 'מקור פרמיית סיכון אמין טרם חובר; אין כאן נתון CDS או פרוקסי מומצא.', 0.20, '{"rule":"source_pending"}', '{"rule":"source_pending"}', '{"rule":"source_pending"}'),
  ('long_real_yield', 'long_real_yield', 'תשואה ריאלית ארוכה', 'הכיוון מתאר תנועה בתשואה, לא את רמתה ההיסטורית.', 0.25, '{"rule":"falling_20d"}', '{"rule":"within_5bp_20d"}', '{"rule":"rising_20d"}'),
  ('long_yield_momentum', 'long_yield_momentum', 'מגמת תשואות ארוכות', 'משווה שינויי 5 ו-20 ימי מסחר לממוצע נע של 20 תצפיות.', 0.10, '{"rule":"5d_20d_falling_below_ma20"}', '{"rule":"mixed_momentum"}', '{"rule":"5d_20d_rising_above_ma20"}');

INSERT INTO dashboard_settings (key, value_json, description) VALUES
  ('regime_positive_threshold', '0.35', 'Weighted regime threshold for supportive-of-lower-yields description.'),
  ('regime_negative_threshold', '-0.35', 'Weighted regime threshold for supportive-of-higher-yields description.'),
  ('inflation_target_low', '1', 'Lower bound of the Bank of Israel annual inflation target.'),
  ('inflation_target_high', '3', 'Upper bound of the Bank of Israel annual inflation target.'),
  ('inflation_material_rise', '0.3', 'Year-on-year inflation increase, in percentage points, that flips the rule red.'),
  ('policy_rate_change_threshold', '0.01', 'Policy-rate change in percentage points for a directional state.'),
  ('yield_monthly_change_threshold_bps', '5', 'Long real-yield monthly change threshold in basis points.'),
  ('rate_lookback_observations', '20', 'Number of stored policy-rate observations used for directional comparison.'),
  ('yield_comparison_days', '30', 'Calendar-day lookback for the latest comparable BOI curve observation.');
