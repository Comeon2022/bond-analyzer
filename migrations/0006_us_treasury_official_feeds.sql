PRAGMA foreign_keys = ON;

INSERT INTO data_sources (id, key, name, base_url, source_type, is_official)
VALUES ('us_treasury', 'us_treasury', 'U.S. Treasury', 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates', 'csv', 1);

INSERT INTO macro_series (id, key, name_he, name_en, category, unit, frequency, source_id, source_series_code, stale_after_hours, min_plausible, max_plausible) VALUES
  ('ust_2y_nominal', 'ust_2y_nominal', 'תשואה נומינלית לשנתיים בארה״ב — משרד האוצר האמריקאי', 'US 2Y nominal Treasury yield', 'us_rates', '%', 'daily_business_day', 'us_treasury', 'UST_2Y_NOMINAL', 72, -10, 40),
  ('ust_10y_nominal', 'ust_10y_nominal', 'תשואה נומינלית ל־10 שנים בארה״ב — משרד האוצר האמריקאי', 'US 10Y nominal Treasury yield', 'us_rates', '%', 'daily_business_day', 'us_treasury', 'UST_10Y_NOMINAL', 72, -10, 40),
  ('ust_10y_real', 'ust_10y_real', 'תשואה ריאלית ל־10 שנים בארה״ב — משרד האוצר האמריקאי', 'US 10Y real Treasury yield', 'us_rates', '%', 'daily_business_day', 'us_treasury', 'UST_10Y_REAL', 72, -10, 40);
