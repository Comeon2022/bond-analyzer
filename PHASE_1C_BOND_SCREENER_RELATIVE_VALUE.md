# Phase 1C — Israeli Bond Screener & Relative-Value Dashboard

## Project
Israel Macro / Rates Dashboard

## Objective
Extend the completed Phase 1A + Phase 1B macro/rates dashboard into a practical **Israeli high-grade bond relative-value workspace**.

Phase 1C should let the user compare Israeli government bonds with high-grade infrastructure / government-linked corporate bonds and answer:

> איפה נמצאת התשואה העודפת ביחס למח״מ ולסיכון?

The dashboard must remain descriptive and analytical. It must not generate buy/sell recommendations.

---

# 1. Existing foundation to preserve

Phase 1A / 1B already include:
- Hebrew RTL dashboard
- Cloudflare Worker API
- D1 with source provenance and revision history
- BOI rate
- CBS CPI
- BOI nominal / real government curves
- BOI inflation expectations
- USD/ILS
- U.S. 10Y nominal / real yields
- IL-US real-yield differential
- Israel Risk Conditions Proxy
- weighted regime score with coverage
- deterministic “What changed?” engine
- daily regime history
- source-status / staleness handling
- no fake observed market values

Do not regress any of the above.

---

# 2. Immediate cleanup required before new bond features

## 2.1 Hebrew localization
The current handoff states that deterministic “What changed?” bullets are still rendered in English.

Phase 1C must localize all newly generated change-summary sentences into Hebrew.

Requirements:
- Hebrew RTL
- concise financial language
- no mixed English unless it is a canonical market symbol
- snapshot tests for Hebrew output
- preserve deterministic templating
- no LLM dependency

Example:
`התשואה הריאלית הארוכה בישראל ירדה ב־9 נ״ב מאז העדכון הקודם.`

---

# 3. Core Phase 1C product areas

Implement five major areas:

1. Bond universe
2. Government benchmark matching
3. Relative-value table
4. Yield-vs-duration chart
5. Spread history / change detection

---

# 4. Initial bond universe

The initial universe should focus on Israeli high-grade infrastructure / government-linked issuers.

Start with these issuer groups:

## Government
- Israeli CPI-linked government bonds
- Israeli nominal government bonds

## Israel Ports Company / חברת נמלי ישראל
At minimum:
- Series B
- Series D

## Israel Electric Corporation / חברת החשמל
At minimum include the currently active CPI-linked high-grade series used by the user’s earlier analysis, such as:
- 31
- 34
- 36
- 37
and any other active comparable series discovered from the verified market source.

## Mekorot / מקורות
At minimum:
- Series 11
and additional active CPI-linked series if available.

## Israel Natural Gas Lines / נתיבי גז
At minimum:
- Series D
and additional active comparable high-grade series if available.

Do not hard-code this list as the only universe. Seed issuer metadata, but discover active tradable series from a verified source where feasible.

---

# 5. Data-source policy

## 5.1 Preferred hierarchy

Use, in order of preference:

1. Official TASE data / issuer disclosures / approved official market-data endpoint
2. Official issuer / trustee / rating-agency data
3. Reliable licensed or public secondary source only if no practical official machine-readable source exists

The production dashboard must not scrape an unstable HTML page if a more durable endpoint exists.

## 5.2 Required fields per bond

For each bond, ingest or derive:

- issuer
- series
- security identifier / TASE identifier
- bond type
- CPI-linked / nominal
- coupon
- maturity date
- next principal payment date
- final principal payment date
- clean price if available
- dirty price if available
- yield to maturity
- real yield if CPI-linked
- nominal yield if nominal
- modified duration / duration / Macaulay duration if source supplies it
- outstanding amount if available
- rating
- rating agency
- rating date
- collateral / security summary if available
- trading volume
- last trade date/time
- source observation timestamp
- source URL

If a field is unavailable:
- store null
- never fabricate
- show unavailable clearly in UI

---

# 6. Important terminology and yield handling

## CPI-linked bonds
For CPI-linked bonds, display:
- `תשואה ריאלית לפדיון`

Do not label it simply “תשואה” when ambiguity exists.

## Nominal bonds
Display:
- `תשואה נומינלית לפדיון`

## Coupon
Always separate:
- coupon rate
from
- yield to maturity

The dashboard must include a tooltip explaining:
`הקופון הוא הריבית החוזית של האג״ח; התשואה לפדיון מושפעת גם ממחיר השוק.`

---

# 7. Government benchmark matching

This is a core feature.

For every corporate bond, identify a comparable Israeli government bond / interpolated government benchmark.

## 7.1 Matching method

Preferred calculation:
- use government yield curve interpolation by **duration**, not merely maturity date

If exact modified duration is available:
- interpolate the appropriate government curve at the same duration

If duration is unavailable but maturity is available:
- use maturity-based interpolation
- mark benchmark quality as lower

For CPI-linked corporate bonds:
- benchmark against the **real CPI-linked government curve**

For nominal corporate bonds:
- benchmark against the **nominal government curve**

## 7.2 Derived fields

Calculate:

`credit_spread_bp = corporate_yield - interpolated_government_yield`

Express as basis points.

Also calculate:

`spread_per_duration = credit_spread_bp / duration`

This is an **informal heuristic**, not a standard credit-risk measure.

The UI must label it:
`מרווח לכל שנת מח״מ (מדד השוואתי)`

Tooltip:
`זהו יחס פשוט לצורך השוואה, ואינו OAS, Z-spread או מדד אשראי תקני.`

## 7.3 Benchmark quality

Expose:
- exact duration match
- interpolated
- nearest bond fallback

Each row should include a benchmark-quality indicator.

---

# 8. Relative-value table

Create a new main page or major section:

# `אג״ח תשתיות — השוואת ערך יחסי`

Columns:

- מנפיק
- סדרה
- סוג הצמדה
- דירוג
- תשואה לפדיון
- מח״מ
- אג״ח ממשלתית מקבילה / benchmark
- תשואה ממשלתית
- מרווח
- שינוי מרווח יומי
- שינוי מרווח שבועי
- מרווח / מח״מ
- מחזור מסחר
- תאריך נתון

Features:
- sortable columns
- filter by issuer
- filter by rating
- filter CPI-linked vs nominal
- duration range
- maturity range
- minimum trading volume
- hide stale quotes
- mobile-friendly condensed mode

Do not apply “best”, “worst”, “top pick”, or investment rankings.

A user may sort by a metric, but the app must not label the first row as the recommended bond.

---

# 9. Yield vs Duration chart

Create a central interactive scatter chart:

## `תשואה מול מח״מ`

X-axis:
- duration in years

Y-axis:
- yield to maturity

Series:
- Israeli government
- Israel Ports
- IEC
- Mekorot
- INGL
- additional approved issuer groups

Rules:
- CPI-linked and nominal must be shown separately, not mixed into one misleading chart
- default view should be CPI-linked
- toggle:
  - `צמוד מדד`
  - `שקלי`

Tooltip:
- issuer
- series
- duration
- yield
- benchmark yield
- spread
- rating
- observation date

Optional:
- draw government curve line
- corporate points sit above it

Do not visually imply that a higher point is “better”.

---

# 10. Spread-vs-duration chart

Add a second scatter:

## `מרווח אשראי מול מח״מ`

X:
- duration

Y:
- credit spread in bp

Use this chart to visually compare how much extra spread is paid at each duration.

Tooltip:
- issuer
- series
- duration
- spread
- spread/duration
- rating

---

# 11. Bond detail view

Clicking a bond should open a detail drawer / page.

Sections:

## Overview
- issuer
- series
- type
- rating
- price
- YTM
- duration
- maturity
- amount outstanding
- last trade

## Relative value
- benchmark yield
- current spread
- spread/duration
- benchmark quality

## History
- price
- YTM
- spread
- benchmark yield

Time windows:
- 1M
- 3M
- 6M
- 1Y
- MAX available

## Cash-flow / principal schedule
If source data supports:
- coupon dates
- principal repayment dates
- principal percentages

## Risk notes
Structured factual fields only:
- rating
- security/collateral
- CPI linkage
- concentration of repayments
- stale/liquidity warnings

No recommendation language.

---

# 12. Spread history

Store daily bond snapshots.

Create additive tables such as:

## bond_master
- id
- issuer_key
- issuer_name_he
- series_name
- security_id
- linkage_type
- coupon_rate
- maturity_date
- currency
- is_active
- metadata_source
- created_at
- updated_at

## bond_market_observations
- bond_id
- observation_date
- observed_at
- clean_price
- dirty_price
- ytm
- real_ytm
- nominal_ytm
- duration
- modified_duration
- trading_volume
- source_id
- payload_hash
- revision
- ingested_at

Unique / revision-safe semantics consistent with existing macro history.

## bond_benchmark_observations
- bond_id
- observation_date
- benchmark_curve
- benchmark_duration
- benchmark_yield
- matching_method
- spread_bp
- spread_per_duration
- calculation_version
- created_at

## bond_ratings
- bond_id
- agency
- rating
- outlook
- rating_date
- source_url
- ingested_at

---

# 13. Spread-change calculations

For each bond calculate:
- 1D spread change
- 5-business-day spread change
- 20-business-day spread change
- 60-business-day spread change if history exists

Use actual observations, not calendar-day fake fills.

If a bond did not trade:
- do not pretend a new market quote exists
- preserve last valid market observation
- show quote age / stale flag

---

# 14. Liquidity and staleness

Bond data can be stale because not every bond trades continuously.

Every row must show:
- last trade date
- quote age
- stale indicator

Suggested UI:
- `עדכני`
- `ישן 1–3 ימים`
- `ישן מעל 3 ימי מסחר`

Do not calculate a “current” spread from a stale corporate quote and a fresh government curve without indicating that the timestamps differ.

If timestamps differ materially:
display:
`מרווח משוער — נתוני האג״ח והממשלתי אינם מאותו מועד`

---

# 15. Rating handling

Ratings must come from verified rating-agency / issuer disclosures.

Support:
- S&P Maalot
- Midroog

Store separately rather than coercing all agencies into one synthetic scale.

UI may show:
`ilAAA / Aaa.il`

Do not invent equivalence if only one agency rating exists.

---

# 16. Data-source discovery task

Before coding the market adapter, inspect available official / stable sources for:
- TASE security master
- TASE bond trading data
- TASE prices / yields / duration
- issuer bond terms
- rating disclosures

Document:
- exact endpoint/source
- authentication requirements
- usage limitations
- update cadence
- fields available

If the needed production-quality bond-market data requires a paid/license-restricted feed:
- do not bypass the restriction
- implement the adapter interface and source-pending state
- use only legally accessible verified fields
- document the blocker in README/HANDOFF

Do not scrape around access controls.

---

# 17. API routes

Suggested routes:

- `GET /api/bonds`
- `GET /api/bonds/:id`
- `GET /api/bonds/:id/history`
- `GET /api/bonds/:id/benchmark`
- `GET /api/bonds/relative-value`
- `GET /api/bonds/curve?linkage=cpi`
- `GET /api/bonds/curve?linkage=nominal`
- `GET /api/bonds/spreads`
- `GET /api/bonds/source-status`

Query parameters:
- issuer
- linkage
- min_duration
- max_duration
- min_rating
- stale
- date

All routes:
- typed
- null-safe
- expose observation timestamps
- expose provenance
- support stale indicators

---

# 18. New “What changed?” bond bullets

Extend the deterministic Hebrew change engine with bond-market observations.

Examples:
- `המרווח של נמלי ישראל ד׳ הצטמצם ב־6 נ״ב בשבוע האחרון.`
- `התשואה הריאלית של חברת חשמל 37 עלתה ב־9 נ״ב, בעוד הממשלתי המקביל עלה ב־4 נ״ב.`
- `מקורות 11 נסחרה ללא שינוי מהותי במרווח ביחס לשבוע שעבר.`

Rules:
- maximum 2 bond bullets in the global overview
- only emit when movement passes a configured threshold
- no causal claims unless directly supported
- no “אטרקטיבי”, “יקר”, “זול”, “עדיף” in automated text

---

# 19. Relative-value language

The app may use:
- `מרווח גבוה יותר`
- `מרווח נמוך יותר`
- `מעל/מתחת לחציון הקבוצה`
- `שינוי במרווח`
- `תשואה ביחס למח״מ`

The app must not autonomously use:
- `הכי טוב`
- `הכי משתלם`
- `לקנות`
- `למכור`
- `הזדמנות`
- `מומלץ`

---

# 20. Summary cards

Add compact top-level cards:

## CPI-linked high-grade infrastructure
- median real yield
- median duration
- median spread
- number of fresh bonds

## Spread trend
- median 5D spread change
- widening / stable / narrowing

## Curve comparison
- government 5Y real
- infrastructure median around 5Y
- government 10Y real
- infrastructure median around 10Y

Only compute when enough fresh observations exist.

---

# 21. Testing

Minimum tests:

## Benchmark matching
- exact duration
- interpolation
- nearest fallback
- CPI vs nominal curve
- unavailable benchmark

## Spread
- positive spread
- negative spread
- null yields
- bp conversion
- spread/duration
- zero/invalid duration

## Staleness
- same-day
- 1 business day
- weekend handling
- >3 business days
- mismatched benchmark timestamp warning

## Filtering
- issuer
- duration
- linkage
- rating
- stale exclusion

## History
- duplicate suppression
- changed payload revision
- unchanged payload
- stale last trade

## Hebrew change bullets
- narrowing spread
- widening spread
- insignificant move
- missing history
- snapshot tests

---

# 22. UX / visual design

Maintain the current light, professional dashboard style.

Requirements:
- Hebrew RTL
- compact desktop table
- mobile cards
- no excessive color
- green/yellow/red reserved primarily for regime status
- bond charts should use neutral categorical colors, not green=good/red=bad
- clear legends
- tooltips explaining yield, duration, spread, linkage

---

# 23. Performance

- paginate large bond tables
- server-side filtering where practical
- cache derived benchmark data
- avoid recalculating full history on every request
- daily derived benchmark job after market observations update

---

# 24. Cloudflare / D1

Add a new migration, additive only.

Do not destroy or rewrite existing macro tables.

If local Wrangler workerd still fails on Windows:
- validate SQL with SQLite as before
- run `wrangler deploy --dry-run`
- document inability to interactively test local Worker+D1

Do not perform production deployment unless explicitly instructed.

---

# 25. Git safety

The latest handoff states:
- `bond dashboard` still has no Git repository / dashboard remote
- nearby RAGOps is unrelated
- RAGOps was not modified

Therefore:

1. Run:
   `git rev-parse --show-toplevel`

2. If the dashboard is still not a Git repo:
   - implement and verify locally
   - update `CHATGPT_HANDOFF.md`
   - do not initialize Git
   - do not select an arbitrary remote
   - do not touch RAGOps
   - clearly report that commit/push was impossible

3. If a valid dashboard repository now exists:
   - inspect `git remote -v`
   - verify it clearly belongs to this dashboard
   - commit all Phase 1C changes
   - push to the existing dashboard remote

Never push this project to RAGOps.

---

# 26. README update

Document:
- bond data sources
- identifiers
- source cadence
- pricing limitations
- stale quote rules
- benchmark interpolation
- spread formula
- spread/duration limitation
- rating sources
- legal/license blockers if any
- how to run ingestion
- how to backfill history
- how to verify the bond source adapter

---

# 27. CHATGPT_HANDOFF.md requirements

At the end of the work, update `CHATGPT_HANDOFF.md` with:

- what Phase 1C implemented
- files changed
- migrations
- exact data sources / endpoints
- bond universe supported
- fields available / unavailable
- benchmark methodology
- stale-data behavior
- tests / typecheck / build / Wrangler results
- source / licensing blockers
- deployment status
- Git / remote status
- next recommended phase

Do not omit unresolved issues.

---

# 28. Acceptance criteria

Phase 1C is complete when:

1. “What changed?” is fully localized to Hebrew.
2. A bond-universe data layer exists.
3. CPI-linked and nominal bonds are separated correctly.
4. Corporate bonds are benchmarked to appropriate government curves.
5. Credit spread is calculated in basis points.
6. Spread/duration heuristic is implemented and clearly labeled non-standard.
7. Relative-value table works with filters/sorting.
8. Yield-vs-duration chart works.
9. Spread-vs-duration chart works.
10. Bond detail view exists.
11. Daily bond history is revision-safe.
12. Stale/non-traded observations are visibly handled.
13. Rating provenance is stored/displayed.
14. No fabricated market values exist.
15. Production licensing constraints are documented.
16. New tests pass.
17. Existing tests pass.
18. Typecheck passes.
19. Build passes.
20. Wrangler dry-run passes.
21. Phase 1A/1B behavior remains intact.
22. `CHATGPT_HANDOFF.md` is fully updated.
23. Git/remote safety rules are followed.

---

# 29. Do not implement yet — Phase 1D candidates

Do not expand Phase 1C into these areas yet:

- portfolio accounting
- personalized investment recommendations
- trade execution
- alerts
- options
- municipal / lower-grade corporate bonds
- AI-generated trading signals
- paid CDS feeds
- user authentication unless already necessary for the app

Possible Phase 1D:
- bond scenario calculator
- cash-flow ladder
- duration / DV01 calculator
- user watchlist
- alert thresholds
- portfolio stress testing
