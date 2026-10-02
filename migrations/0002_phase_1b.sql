PRAGMA foreign_keys = ON;

INSERT INTO data_sources (id, key, name, base_url, source_type, is_official) VALUES
  ('fred', 'fred', 'Federal Reserve Economic Data', 'https://fred.stlouisfed.org', 'official_csv', 1);

INSERT INTO macro_series (id, key, name_he, name_en, category, unit, frequency, source_id, source_series_code, stale_after_hours, min_plausible, max_plausible) VALUES
  ('il_bei_1y', 'il_bei_1y', 'ציפיות אינפלציה לשנה', 'Israel 1Y market inflation expectation', 'inflation_expectations', '%', 'monthly_periodic_average', 'boi', 'shcf10_e.xls column C', 1440, -10, 30),
  ('il_bei_5y', 'il_bei_5y', 'ציפיות אינפלציה ל-5 שנים', 'Israel 5Y market inflation expectation', 'inflation_expectations', '%', 'monthly_periodic_average', 'boi', 'shcf10_e.xls column G', 1440, -10, 30),
  ('il_bei_5y5y', 'il_bei_5y5y', 'ציפיות אינפלציה 5y5y', 'Israel 5Y5Y forward inflation expectation', 'inflation_expectations', '%', 'monthly_periodic_average', 'boi', 'shcf10_e.xls column H', 1440, -10, 30),
  ('il_forecast_cpi_12m', 'il_forecast_cpi_12m', 'תחזית חזאים ל-12 חודשים', 'Israel forecasters 12M CPI forecast', 'inflation_expectations', '%', 'monthly_periodic_average', 'boi', 'shcf10_e.xls column I', 1440, -10, 30),
  ('usd_ils', 'usd_ils', 'שער יציג דולר/שקל', 'BOI representative USD/ILS rate', 'foreign_exchange', 'ILS per USD', 'daily_business_day', 'boi', 'RER_USD_ILS', 72, 0, 100),
  ('us_10y_nominal', 'us_10y_nominal', 'תשואת אג״ח ארה״ב ל-10 שנים', 'US 10Y nominal Treasury yield', 'us_rates', '%', 'daily_business_day', 'fred', 'DGS10', 72, -10, 40),
  ('us_10y_real', 'us_10y_real', 'תשואה ריאלית בארה״ב ל-10 שנים', 'US 10Y real Treasury yield', 'us_rates', '%', 'daily_business_day', 'fred', 'DFII10', 72, -10, 40);

UPDATE signal_definitions SET description_he = 'ציפיות שוק ותחזית חזאים ממוצעת מדוח בנק ישראל; תדירות הפרסום תקופתית.', green_rule_json = '{"rule":"expectations_anchored"}', yellow_rule_json = '{"rule":"expectations_mixed_or_stable"}', red_rule_json = '{"rule":"expectations_rising_or_above_target"}' WHERE key = 'inflation_expectations';
UPDATE signal_definitions SET description_he = 'Israel Risk Conditions Proxy שקוף המבוסס על דולר/שקל, תשואה ריאלית ישראלית ופער תשואה ריאלית מול ארה״ב; אינו CDS סחיר.', green_rule_json = '{"rule":"risk_proxy_improving"}', yellow_rule_json = '{"rule":"risk_proxy_neutral"}', red_rule_json = '{"rule":"risk_proxy_deteriorating"}' WHERE key = 'israel_risk_proxy';
UPDATE signal_definitions SET weight = 0.20, description_he = 'כיוון השינוי בתשואה הריאלית הארוכה; אינו תחזית לתשואה.' WHERE key = 'long_real_yield';
UPDATE signal_definitions SET weight = 0.15, description_he = 'מגמת תשואה נומינלית ארוכה בתדירות קובצי המקור הרשמיים; אין השלמה יומית.' WHERE key = 'long_yield_momentum';
INSERT INTO signal_definitions (id, key, name_he, description_he, weight, green_rule_json, yellow_rule_json, red_rule_json) VALUES
  ('usd_ils', 'usd_ils', 'שער דולר/שקל', 'נתון הקשר: השער היציג של בנק ישראל אינו בהכרח מחיר מסחר בר-ביצוע.', 0, '{"rule":"context_only"}', '{"rule":"context_only"}', '{"rule":"context_only"}'),
  ('us_10y_nominal', 'us_10y_nominal', 'תשואה נומינלית ארה״ב ל-10 שנים', 'נתון הקשר יומי ממאגר FRED, סדרה DGS10.', 0, '{"rule":"context_only"}', '{"rule":"context_only"}', '{"rule":"context_only"}'),
  ('us_10y_real', 'us_10y_real', 'תשואה ריאלית ארה״ב ל-10 שנים', 'נתון הקשר יומי ממאגר FRED, סדרה DFII10.', 0, '{"rule":"context_only"}', '{"rule":"context_only"}', '{"rule":"context_only"}'),
  ('il_us_real_yield_differential', 'il_us_real_yield_differential', 'פער תשואה ריאלית ישראל–ארה״ב', 'פער תשואות ריאליות ארוכות, לא פרמיית CDS.', 0, '{"rule":"context_only"}', '{"rule":"context_only"}', '{"rule":"context_only"}');

INSERT INTO dashboard_settings (key, value_json, description) VALUES
  ('risk_usdils_change_threshold_pct', '2', 'USD/ILS 20-business-session percentage threshold for the Israel risk proxy.'),
  ('risk_real_yield_change_threshold_bps', '15', 'Israeli 10Y real yield source-period change threshold for the Israel risk proxy.'),
  ('risk_real_differential_change_threshold_bps', '15', 'IL-US real-yield differential comparable-period change threshold for the Israel risk proxy.'),
  ('us_yield_lookback_calendar_days', '120', 'Calendar-day fetch range for FRED daily yields, retaining enough business-day observations for 60-session changes.'),
  ('regime_calculation_version', '1', 'Version tag for derived observations and regime snapshot calculation.'),
  ('expectations_stale_after_hours', '1440', 'BOI periodic inflation expectations workbook freshness window.'),
  ('daily_market_stale_after_hours', '72', 'Business-day BOI/FRED market series freshness window.');

CREATE TABLE derived_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_key TEXT NOT NULL,
  observation_date TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  calculation_version TEXT NOT NULL,
  inputs_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (series_key, observation_date, calculation_version)
);
CREATE INDEX idx_derived_observations_series_date ON derived_observations(series_key, observation_date DESC);

CREATE TABLE regime_snapshots (
  snapshot_date TEXT PRIMARY KEY,
  score REAL,
  status TEXT NOT NULL CHECK (status IN ('green', 'yellow', 'red', 'unknown')),
  coverage_pct REAL NOT NULL CHECK (coverage_pct >= 0 AND coverage_pct <= 100),
  green_count INTEGER NOT NULL,
  yellow_count INTEGER NOT NULL,
  red_count INTEGER NOT NULL,
  calculation_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE regime_snapshot_components (
  snapshot_date TEXT NOT NULL REFERENCES regime_snapshots(snapshot_date),
  signal_key TEXT NOT NULL REFERENCES signal_definitions(key),
  value REAL,
  status TEXT NOT NULL CHECK (status IN ('green', 'yellow', 'red', 'unknown')),
  normalized_score REAL,
  effective_weight REAL NOT NULL,
  source_observation_date TEXT,
  PRIMARY KEY (snapshot_date, signal_key)
);

UPDATE signal_definitions SET name_he = char(1514,1504,1488,1497,32,1505,1497,1499,1493,1503,32,1497,1513,1512,1488,1500) WHERE key = 'israel_risk_proxy';
