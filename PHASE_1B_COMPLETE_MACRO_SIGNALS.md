# Phase 1B — Complete Macro Signals & Market Context

## Project
Israel Macro / Rates Dashboard

## Objective
Extend Phase 1A into a practical daily dashboard for the Israeli bond market.

Phase 1A already delivered:
- Hebrew RTL dashboard
- Cloudflare Worker API
- D1 schema with revision history
- BOI policy rate ingestion
- CBS CPI ingestion
- BOI nominal/real yield curves
- regime/signals engine
- source freshness and provenance
- no fake observed market data

Phase 1B must add the missing macro/risk context required to understand **why Israeli bond yields are moving** and whether the environment is becoming more or less supportive for Israeli government and high-grade infrastructure bonds.

The dashboard must remain an **information / market-regime tool**, not an investment recommendation engine.

---

# 1. Core product question

The dashboard should answer, at a glance:

> האם סביבת המאקרו והשוק תומכת כרגע בירידת תשואות, בעליית תשואות, או במצב ניטרלי?

The primary regime indicators should be:

1. Bank of Israel policy rate
2. Actual CPI inflation
3. Inflation expectations
4. Long real Israeli government yield
5. Long nominal Israeli government yield trend
6. Israel risk-conditions proxy
7. USD/ILS
8. U.S. 10Y nominal yield
9. U.S. 10Y real yield
10. Israel–U.S. real-yield differential

---

# 2. Non-negotiable data principles

## 2.1 No invented market values
Never seed or hard-code observed market values.

Seeds may contain source definitions, series metadata, thresholds, weights, labels, and calculation rules.

Observed values must only enter D1 through verified adapters.

## 2.2 Provenance
Every displayed observation must expose:
- source
- source URL
- observation date
- ingestion timestamp
- revision number if applicable
- freshness/staleness state

## 2.3 Missing sources
If a requested signal does not have a verified source:
- display `ממתין למקור`
- exclude it from the regime score
- do not silently substitute unrelated data

## 2.4 Risk-premium terminology
Do **not** label a synthetic metric as “Israel CDS”.

Until a licensed/reliable CDS source is integrated, label the composite:
- `מדד תנאי סיכון ישראל`
- `Israel Risk Conditions Proxy`

The UI must clearly explain that it is a proxy, not a traded CDS quote.

---

# 3. New official / authoritative data sources

## 3.1 Inflation expectations — Bank of Israel

Preferred source: Bank of Israel publication **“The Expected Rate of Inflation Derived from Various Sources”**.

The BOI publishes:
- capital-market expectation for first year
- second-year forward
- third-year forward
- years 3–5 forward
- 5-year expectation
- years 5–10 forward
- average private forecaster expectation for next 12 months
- one-year expectation from internal rates
- one-year expectation from inflation contracts

Create an adapter that retrieves the latest BOI publication and parses the latest reported row.

Minimum Phase 1B series:
- `IL_BEI_1Y`
- `IL_BEI_5Y`
- `IL_BEI_5Y5Y`
- `IL_FORECAST_CPI_12M`

Do not infer daily observations from a periodic publication. Store the actual publication cadence and mark observations stale according to the expected cadence.

## 3.2 USD/ILS — Bank of Israel

Use the official representative exchange-rate series.

Current-rate API:
`https://boi.org.il/PublicApi/GetExchangeRate?key=USD`

Historical data should come from the BOI series database / SDMX so 5D / 20D / 60D changes can be calculated.

Create:
- `USDILS`

Derived fields:
- 1D %
- 5D %
- 20D %
- 60D %
- 20D realized direction
- optional 60D percentile / z-score if sufficient observations exist

UI note: the BOI representative rate is an indicative official fixing, not necessarily the exact executable market rate.

## 3.3 U.S. Treasury 10Y nominal — Federal Reserve / FRED

Series:
- `DGS10`

Frequency: daily business days.

Derived:
- 1D bp
- 5D bp
- 20D bp
- 60D bp

## 3.4 U.S. Treasury 10Y real — Federal Reserve / FRED

Series:
- `DFII10`

Frequency: daily business days.

Derived:
- 1D bp
- 5D bp
- 20D bp
- 60D bp

---

# 4. Israel risk-conditions proxy

## 4.1 Purpose
Create a transparent, explainable proxy that captures whether external-market conditions are becoming more or less supportive for long Israeli bonds.

It is **not** a sovereign CDS substitute.

## 4.2 Inputs
Use only verified time series:

A. USD/ILS change
- 20-business-day percentage change
- weaker ILS = risk-negative
- stronger ILS = risk-positive

B. Israel long real yield change
- use interpolated / nearest official BOI real government curve around 10Y
- compare with nearest valid prior period
- rising real yield = risk-negative

C. Israel vs U.S. real yield differential
- `IL_REAL_10Y - US_REAL_10Y`
- widening differential = risk-negative
- narrowing differential = risk-positive

D. Optional later input
- licensed Israel CDS / sovereign spread
- disabled until a verified source is configured

## 4.3 Proxy score
Normalize each available component:
- +1 = supportive / improving
- 0 = neutral
- -1 = deteriorating

Suggested initial thresholds:

### USD/ILS 20D
- <= -2.0% → +1
- between -2.0% and +2.0% → 0
- >= +2.0% → -1

### Israeli long real yield change
- <= -15 bp → +1
- between -15 and +15 bp → 0
- >= +15 bp → -1

### IL-US real-yield differential change
- <= -15 bp → +1
- between -15 and +15 bp → 0
- >= +15 bp → -1

Composite:
- average only available components
- >= +0.5 → green / improving
- <= -0.5 → red / deteriorating
- otherwise yellow / neutral

Store thresholds in DB, not code. Expose component breakdown in UI.

---

# 5. Signal engine changes

Retain existing signals:
- policy rate
- CPI
- long real yield
- yield trend
- source freshness logic

Add:
- inflation expectations
- USD/ILS
- U.S. 10Y nominal yield
- U.S. 10Y real yield
- Israel risk-conditions proxy
- IL-US real-yield differential

## Suggested initial regime weights
- Policy rate: 15%
- Actual CPI: 15%
- Inflation expectations: 15%
- Long Israeli real yield: 20%
- Long Israeli yield trend: 15%
- Israel risk-conditions proxy: 20%

Context-only initially:
- U.S. 10Y nominal
- U.S. 10Y real
- USD/ILS raw level

If any weighted signal is unavailable/stale:
- renormalize across valid signals
- display regime coverage percentage

Example: `כיסוי האיתות: 83%`

---

# 6. Signal interpretation

Every signal card must show:
- current value
- observation date
- change
- status color
- plain-language interpretation
- source
- freshness

Never state certainty or guarantee a future market move.

---

# 7. “What changed?” engine

Add a prominent section:

## `מה השתנה?`

Generate text deterministically from stored data, not from an external LLM.

Compare:
- latest observation
- previous valid observation
- 5D / 20D where appropriate

Maximum 3–5 bullets.

Examples:
- `התשואה הריאלית הארוכה בישראל ירדה 9 נ״ב מאז העדכון הקודם.`
- `הדולר נחלש מול השקל ב־1.4% ב־20 ימי מסחר.`
- `ציפיות האינפלציה לשנה נותרו כמעט ללא שינוי.`
- `התשואה הריאלית ל־10 שנים בארה״ב עלתה 12 נ״ב בשבוע.`

Then one non-prescriptive summary.

Rules:
- deterministic templates
- no recommendations
- no buy/sell language
- no unsupported causal claims

---

# 8. UI layout

## Header
Title: `שוק האג״ח הישראלי`

Subtitle: `מאקרו, ריבית, אינפלציה ותשואות`

Right side:
- last successful refresh
- refresh button
- source-status indicator

## Section A — Market regime
Large regime card, for example: `סביבת אג״ח: חיובית מתונה`

Show:
- green count
- yellow count
- red count
- signal coverage %

Primary signal cards:
1. ריבית בנק ישראל
2. אינפלציה
3. ציפיות אינפלציה
4. תשואה ריאלית ארוכה
5. מגמת תשואות ארוכות
6. תנאי סיכון ישראל

## Section B — What changed?
Deterministic change summary.

## Section C — Israeli curves
Retain Phase 1A nominal and real yield curves.
Enhance with:
- current curve
- previous available observation
- optional ~30-calendar-day prior curve
- hover bp change

Do not fake daily points if BOI source cadence does not support them.

## Section D — Global context
Four cards:

### USD/ILS
- current
- 1D
- 20D

### U.S. 10Y nominal
- current
- 5D bp
- 20D bp

### U.S. 10Y real
- current
- 5D bp
- 20D bp

### Israel – U.S. real spread
- current spread in bp
- change from prior comparable observation

Add note: `פער התשואות אינו פרמיית CDS; הוא כלי השוואה בין תשואות ריאליות ארוכות.`

## Section E — Inflation expectations
Show:
- 1Y market expectation
- 5Y expectation
- 5Y5Y / years 5–10 forward
- forecasters 12M

Display observation/publication date prominently.

## Section F — Signal history
Store daily computed dashboard snapshots.

Chart:
- regime score over time
- coverage over time

History table:
- date
- overall regime
- green/yellow/red counts
- top positive contributor
- top negative contributor

---

# 9. Database changes

Create a new additive migration.

## `derived_observations`
Fields:
- id
- series_key
- observation_date
- value
- unit
- calculation_version
- inputs_hash
- created_at

Unique:
- `(series_key, observation_date, calculation_version)`

## `regime_snapshots`
Fields:
- snapshot_date
- score
- status
- coverage_pct
- green_count
- yellow_count
- red_count
- calculation_version
- created_at

## `regime_snapshot_components`
Fields:
- snapshot_date
- signal_key
- value
- status
- normalized_score
- effective_weight
- source_observation_date

Never overwrite historical snapshots unless a formal recalculation/revision path is used.

---

# 10. Worker endpoints

Add / extend:
- `GET /api/macro/inflation-expectations`
- `GET /api/markets/usdils`
- `GET /api/markets/us10y`
- `GET /api/markets/us-real-10y`
- `GET /api/markets/real-yield-differential`
- `GET /api/risk/israel-proxy`
- `GET /api/changes/today`
- `GET /api/regime/history`

Existing overview endpoint should include compact versions.

All endpoints:
- null safe
- typed
- expose observation dates
- source provenance
- stale status

---

# 11. Ingestion schedule

Use Cloudflare scheduled jobs.

Daily:
- BOI FX
- FRED U.S. yields

Existing official cadence:
- BOI rate
- CPI
- BOI yield curves

Inflation expectations:
- check daily for a new BOI publication
- insert only when a new publication/period appears
- never duplicate an unchanged publication

---

# 12. Adapter behavior

Each adapter must support:
- fetch
- validate
- parse
- normalize
- payload hash
- source observation date
- ingestion metadata
- clear failure state

A source format change must:
- fail visibly
- record the ingestion error
- preserve previous valid observations
- never write malformed zero/default values

---

# 13. Tests

Minimum new tests:

## Inflation expectations
- parses current BOI table
- correct tenor mapping
- publication date persisted
- missing row fails safely
- unchanged publication does not duplicate

## FX
- parses USD
- historical observations
- business-day gap handling
- 20D change

## FRED
- DGS10 parse
- DFII10 parse
- `.` missing-value handling
- weekend/holiday gaps

## Risk proxy
- all green
- all red
- neutral
- missing one component
- missing all components
- threshold boundary values

## Regime
- weight renormalization
- coverage %
- stale exclusion
- deterministic status

## What changed
- rising yields
- falling yields
- unchanged series
- missing inputs
- Hebrew snapshot tests

---

# 14. UX rules

- Hebrew RTL throughout
- green/yellow/red only for status meaning
- do not imply certainty
- every metric gets an explanation tooltip
- show dates next to periodic indicators
- stale values visually obvious
- mobile readable
- charts must not imply interpolated daily observations unless explicitly marked as interpolation

---

# 15. Terminology

Use:
- `תשואה לפדיון`
- `תשואה ריאלית`
- `תשואה נומינלית`
- `ציפיות אינפלציה`
- `פער תשואות`
- `תנאי סיכון`
- `מח״מ` only where actual bond duration is known

Do not use:
- `CDS` for the synthetic risk proxy
- `פרמיית סיכון` as a precise traded metric unless the source actually supplies one
- `תחזית` for a deterministic regime label

---

# 16. README update

Document:
- source list
- exact series IDs
- source cadence
- stale thresholds
- formulas
- proxy limitations
- local ingestion instructions
- Cloudflare cron behavior
- D1 migration
- why CDS is not included yet

---

# 17. Phase 1B acceptance criteria

Phase 1B is complete only if:

1. Inflation expectations are sourced from BOI.
2. USD/ILS history is sourced from BOI.
3. DGS10 and DFII10 are ingested from an authoritative Federal Reserve/FRED source.
4. Israel risk conditions proxy is implemented and explicitly labeled as a proxy.
5. U.S./Israel real-yield differential is visible.
6. Market regime handles missing and stale data correctly.
7. “What changed?” works from real stored observations.
8. No fake observed values exist in migrations, production fixtures, or docs.
9. Source provenance is visible in UI.
10. Tests pass.
11. Typecheck passes.
12. Build passes.
13. Wrangler dry-run passes.
14. Existing Phase 1A features remain functional.
15. `CHATGPT_HANDOFF.md` is updated with implemented features, files/migrations, source URLs/series IDs, verification, blockers, and deployment status.
16. Commit all task changes.
17. Push the commit to the current dashboard Git remote, only if that verified dashboard remote exists.

---

# 18. Git safety

The previous handoff states that the dashboard directory currently has **no Git repository / remote**, while a nearby RAGOps repository has an unrelated remote.

Therefore:
- NEVER push these changes to RAGOps.
- Before implementation, run `git rev-parse --show-toplevel`.
- If the dashboard is still not a Git repo:
  - implement and verify locally
  - update `CHATGPT_HANDOFF.md`
  - do **not** initialize a repo or select a remote without explicit user instruction
  - report clearly that commit/push could not be performed because no dashboard remote exists
- If a dashboard Git repo now exists, verify the remote URL is clearly for this project before committing/pushing.

---

# 19. Future Phase 1C — do not implement now

Do not implement these unless already supported cleanly:
- live corporate bond spreads
- Israel Ports / IEC / Mekorot / INGL bond screener
- bond-specific trade scenario engine
- licensed sovereign CDS
- alerts
- user portfolios

Phase 1B should finish the macro / rates foundation first.
