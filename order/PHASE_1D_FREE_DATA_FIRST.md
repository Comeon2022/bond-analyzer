# Phase 1D-Free — Free Data First: Israeli Bond Market Dashboard

## Project
Israel Macro / Rates / Bond Analyzer

## Goal
Make the dashboard useful now using only free, legally accessible, verified data sources.

Do not wait for paid TASE DATA HUB access.

The paid single-bond screener remains source-pending, but the dashboard should become fully populated with free macro, government-curve, inflation-expectations, FX, global-rates, and corporate-spread data.

---

# 1. Core principle

Use only:
- Bank of Israel
- CBS
- Federal Reserve / FRED
- Ministry of Finance / other official public sources where needed

Do not:
- scrape paywalled/unstable bond pages
- fabricate individual corporate bond observations
- populate individual bond rows from hand-entered market quotes in production

---

# 2. Free corporate bond spread data

## Official source
Bank of Israel:
`https://www.boi.org.il/roles/statistics/makamandbonds/yield/`

The BOI page explicitly provides:
- government yield curves
- zero-coupon curves
- corporate bond yield margins / spreads
- corporate spreads by:
  - exchange sector
  - rating group

This should become the free credit-market layer.

---

# 3. New free-data modules

Implement these sections:

## A. Corporate spreads by rating
Display latest available spread series for rating groups exposed by BOI.

Examples may include:
- AAA / AA / A / BBB or the exact official grouping available

Do not invent grouping names. Parse the official source exactly.

For each available rating group show:
- current spread
- observation date
- 1M change
- 3M change
- 12M percentile if enough history exists

Chart:
`מרווחי אג״ח קונצרני לפי דירוג`

---

## B. Corporate spreads by sector
Display available BOI sector groups.

Use the source labels exactly.

For each:
- current spread
- 1M change
- 3M change

Chart:
`מרווחים קונצרניים לפי ענף`

---

## C. Tel Bond 60 spread monitor
Add a dedicated card:

`מרווח תל בונד 60 מול ממשלתי צמוד`

Use official BOI published data / press-release series if available in a structured source.

Show:
- latest spread
- prior month
- 3M trend
- current interpretation:
  - narrowing
  - stable
  - widening

No recommendation language.

---

# 4. Free dashboard structure

Replace empty paid-data emphasis with a useful free-data-first layout.

## Top
### `מצב שוק האג״ח`
Keep:
- rate
- CPI
- expectations
- long real yield
- long nominal yield trend
- Israel risk conditions

## Government
### `עקום ממשלתי`
- nominal
- real
- curve comparison
- current vs previous available observation

## Credit
### `שוק קונצרני`
- spreads by rating
- spreads by sector
- Tel Bond 60 spread
- spread trend summary

## Global
- USD/ILS
- US 10Y
- US 10Y real
- IL-US real-yield differential

## Source status
Show free official sources separately from paid/single-security source status.

---

# 5. UI treatment of individual-bond screener

Do not let the unavailable paid screener dominate the page.

Move the individual-bond section lower and label it:

`אג״ח בודדות — מקור נתונים מתקדם`

Status:
`ממתין לחיבור לנתוני בורסה מורשים`

Explain:
`נתוני המאקרו, העקום הממשלתי והמרווחים הקונצרניים בדאשבורד פעילים ממקורות חינמיים ורשמיים. נתוני סדרות אג״ח בודדות דורשים מקור שוק מורשה.`

---

# 6. Ingestion

Build a BOI corporate-spread adapter.

Requirements:
- inspect the official downloadable file / series source linked from BOI
- identify exact series IDs / workbook names
- parse rating and sector spreads
- preserve official observation dates
- no fake daily interpolation
- payload hash
- revision-safe inserts
- source freshness

If multiple public BOI files are needed, support separate adapters.

---

# 7. Database

Add additive migration only.

Suggested series:
- `IL_CORP_SPREAD_RATING_*`
- `IL_CORP_SPREAD_SECTOR_*`
- `IL_TELBOND60_SPREAD`

Do not hard-code values.

Store official labels in metadata.

---

# 8. API

Add:
- `GET /api/credit/spreads/ratings`
- `GET /api/credit/spreads/sectors`
- `GET /api/credit/telbond60`
- `GET /api/credit/summary`

Include:
- latest
- history
- source
- observation date
- stale status

---

# 9. Credit regime indicator

Add a new context signal:

`מרווחי אשראי קונצרניים`

Do not initially include it in the weighted primary regime unless explicitly configured.

Suggested interpretation:
- narrowing spreads → supportive credit conditions
- widening spreads → deteriorating credit conditions

Use configurable thresholds.

---

# 10. “What changed?” additions

Add deterministic Hebrew bullets:

Examples:
- `מרווח תל בונד 60 הצטמצם ב־6 נ״ב לעומת החודש הקודם.`
- `מרווחי קבוצת הדירוג AA התרחבו ב־12 נ״ב בשלושת החודשים האחרונים.`
- `מרווחי ענף הנדל״ן נותרו כמעט ללא שינוי.`

No causal claims unless source directly supports them.

---

# 11. Charts

Add:
1. Line chart — rating spreads through time
2. Line chart — sector spreads through time
3. Tel Bond 60 spread history

Allow:
- 6M
- 1Y
- 3Y
- MAX

Do not display nonexistent periods.

---

# 12. Free-source labels

Each free-data panel should show a badge:

`מקור רשמי חינמי`

Tooltip:
`הנתון מתקבל ממקור ציבורי רשמי ואינו דורש מנוי לנתוני בורסה.`

---

# 13. Current official evidence

The Bank of Israel states its bond statistics include:
- government and corporate bond data
- yield curves
- zero-coupon curves
- corporate yield margins by exchange sector and rating groups

Recent BOI reporting also tracks the spread between Tel Bond 60 corporate bonds and CPI-linked government bonds.

Use the official series/source behind these publications where available.

---

# 14. Tests

Add tests for:
- rating spread parsing
- sector spread parsing
- missing group
- latest observation
- stale detection
- monthly gaps
- spread-change calculations
- Hebrew “What changed?” bullets
- empty-source failure

All existing tests must continue passing.

---

# 15. Deployment

After implementation:
- typecheck
- tests
- build
- Wrangler dry-run
- deploy Worker
- verify new credit APIs
- commit
- push to `main`

Update `CHATGPT_HANDOFF.md`.

---

# 16. Acceptance criteria

Complete when:

1. Dashboard has useful populated free credit data.
2. BOI corporate spreads by rating are visible.
3. BOI corporate spreads by sector are visible.
4. Tel Bond 60 spread monitor is visible if officially obtainable.
5. Paid single-bond screener is clearly secondary/source-pending.
6. No paid/scraped market data is used.
7. All data has provenance and dates.
8. No fake observations.
9. All tests pass.
10. Worker is deployed.
11. Git changes are pushed to `main`.
12. Handoff is updated.

---

# 17. Do not implement now

Do not implement:
- paid TASE DATA HUB
- unauthorized scraping
- personalized buy/sell recommendations
- trade execution
