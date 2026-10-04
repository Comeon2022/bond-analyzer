PRAGMA foreign_keys = ON;

INSERT INTO macro_series (id, key, name_he, name_en, category, unit, frequency, source_id, source_series_code, stale_after_hours, min_plausible, max_plausible) VALUES
  ('us_2y_nominal', 'us_2y_nominal', 'תשואה נומינלית ל־2 שנים בארה״ב', 'US 2Y nominal Treasury yield', 'us_rates', '%', 'daily_business_day', 'fred', 'DGS2', 72, -10, 40),
  ('us_10y_breakeven', 'us_10y_breakeven', 'ציפיות אינפלציה ל־10 שנים בארה״ב', 'US 10Y breakeven inflation rate', 'us_rates', '%', 'daily_business_day', 'fred', 'T10YIE', 72, -10, 40);

UPDATE dashboard_settings
SET value_json = '450', description = 'Calendar-day FRED fetch range; retains about a year of daily business observations for historical charts and 60-session lookbacks.'
WHERE key = 'us_yield_lookback_calendar_days';
