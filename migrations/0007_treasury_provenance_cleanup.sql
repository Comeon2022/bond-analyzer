PRAGMA foreign_keys = ON;

-- Keep imported FRED observations for audit, but deactivate the legacy source and series.
UPDATE data_sources SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE key = 'fred';
UPDATE macro_series SET is_active = 0, updated_at = CURRENT_TIMESTAMP
WHERE id IN ('us_2y_nominal', 'us_10y_nominal', 'us_10y_real', 'us_10y_breakeven');

UPDATE signal_definitions
SET description_he = 'תשואה נומינלית יומית ממקור U.S. Treasury הרשמי; נתון הקשר בלבד.'
WHERE key = 'us_10y_nominal';
UPDATE signal_definitions
SET description_he = 'תשואה ריאלית יומית ממקור U.S. Treasury הרשמי; נתון הקשר בלבד.'
WHERE key = 'us_10y_real';
UPDATE signal_definitions
SET description_he = 'פרוקסי שקוף המבוסס על דולר/שקל, תשואה ריאלית בישראל ופער תשואה ריאלית מול ארה״ב ממקור U.S. Treasury; אינו CDS סחיר.'
WHERE key = 'israel_risk_proxy';

UPDATE dashboard_settings
SET description = 'Calendar-day official U.S. Treasury feed range; retains about a year of daily business observations for historical charts and 60-session lookbacks.'
WHERE key = 'us_yield_lookback_calendar_days';
UPDATE dashboard_settings
SET description = 'Business-day Bank of Israel and U.S. Treasury market-series freshness window.'
WHERE key = 'daily_market_stale_after_hours';
