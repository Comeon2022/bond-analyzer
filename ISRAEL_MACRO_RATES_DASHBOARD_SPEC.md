# Israel Macro & Rates Dashboard — Product + Technical Specification

**Version:** 1.0  
**Date:** 2026-10-01  
**Primary language:** Hebrew UI (RTL), with English technical identifiers  
**Goal:** Build a daily decision-support dashboard for the Israeli rates and bond market that explains whether the macro/rates environment is currently supportive, neutral, or adverse for Israeli bonds — especially government-linked infrastructure issuers and CPI-linked bonds.

---

## 1. Product objective

Build a web dashboard that answers, at a glance:

> **Is the Israeli macro/rates environment currently supportive of falling bond yields / rising bond prices, neutral, or supportive of rising yields / falling bond prices?**

The dashboard must not present a trading recommendation. It should present transparent inputs, rules, trends, historical context, and descriptive market-regime signals.

The first release should focus on:

1. Bank of Israel policy rate.
2. CPI inflation.
3. Market inflation expectations.
4. Israel risk premium proxies.
5. Long real government yields.
6. Trend in long government yields.
7. Corporate / quasi-sovereign credit spreads.
8. Government and government-owned infrastructure bonds.
9. Daily snapshots so signals can be evaluated historically.

---

## 2. Core dashboard — top-level regime cards

The first screen must show six primary cards. Each card contains:

- Current value.
- Previous value.
- Daily / weekly / monthly change where relevant.
- Status: **חיובי / ניטרלי / שלילי**.
- Traffic-light color: green / yellow / red.
- Short explanation: "מה זה אומר לשוק האג״ח".
- Data timestamp.
- Data source.
- A small trend sparkline.

### 2.1 ריבית בנק ישראל

Display:

- Current Bank of Israel policy rate.
- Last decision date.
- Size of last change.
- Next scheduled decision date.
- 3M / 6M / 12M rate trend if available.

Default signal logic for bonds:

- Green: rate-cutting cycle / declining policy rate and no sharp inflation deterioration.
- Yellow: rate stable or mixed signals.
- Red: hiking cycle / rising policy rate.

**Important:** Do not equate the policy rate directly with long bond yields. The explanatory text must make this distinction clear.

Primary official source:
- Bank of Israel Public API: `https://www.boi.org.il/PublicApi/GetInterest`

Bank of Israel documentation confirms an API endpoint for the current rate and the next rate-update date. Historical series can be consumed from the Bank of Israel SDMX series service.

---

### 2.2 אינפלציה

Display:

- Latest monthly CPI change.
- 12-month CPI inflation.
- Previous 12-month inflation.
- Bank of Israel inflation target range visualization.
- 3M / 6M / 12M trend.

Signal logic:

- Green: inflation declining / inside target, particularly near target midpoint.
- Yellow: inflation inside target but trend ambiguous.
- Red: inflation rising materially or above target.

Primary official source:
- Israel Central Bureau of Statistics price indices API.
- API documentation supports JSON / CSV / XLS and CPI chapter data.
- Base endpoint documentation: `https://api.cbs.gov.il/Index/`

Implementation requirement:
- Create a CBS adapter; do not hard-code CPI values.
- Store both source index level and calculated YoY / MoM values.

---

### 2.3 פרמיית סיכון ישראל

This card should use multiple inputs because there is no single perfect public risk-premium metric.

Preferred inputs, in order:

1. Israel sovereign CDS if a reliable permitted source is available.
2. Israel USD sovereign bond spread vs matched U.S. Treasury.
3. USD/ILS volatility / trend as a market-stress proxy.
4. Sovereign rating / outlook changes as event flags.

Display:

- Main selected risk-premium metric.
- 1D / 1W / 1M change.
- Percentile vs 1Y history.
- Stress flag.

Signal logic:

- Green: spread/risk proxy contracting.
- Yellow: stable.
- Red: material widening / stress.

Important implementation rule:
- The signal must use defined thresholds from historical distributions, not arbitrary text judgments.
- If a premium data source is unavailable, use a clearly labeled proxy instead of inventing CDS data.

---

### 2.4 ציפיות אינפלציה

Display inflation expectations by tenor, ideally:

- 1Y.
- 2Y.
- 5Y.
- 5Y–10Y / long-term if available.

Use Bank of Israel published market-expectations series or derive break-even from nominal and real zero curves when appropriate.

Primary source:
- Bank of Israel statistical series / bond yield pages.
- Bank of Israel publishes nominal and real zero-coupon yield curves and corporate yield margins.

The Bank of Israel page for bond and Makam yields states that the data include:

- Government bond yield curves.
- Zero-coupon nominal curves.
- Zero-coupon real curves.
- Corporate bond yield margins by sector and rating.

Signal interpretation:

- For nominal-bond regime: lower/anchored expectations are generally supportive.
- For CPI-linked bond expected carry: very low inflation expectations reduce expected indexation.
- UI must therefore show **two interpretations**:
  - monetary-policy implication;
  - CPI-linked bond carry implication.

Never label low expectations simply "good" without context.

---

### 2.5 תשואה ריאלית ארוכה

This is one of the most important cards.

Display:

- Model real government yield at representative long tenors: 5Y, 10Y, 15Y where available.
- Alternatively / additionally, show a benchmark tradable CPI-linked government bond near 10–12 years duration.
- Current real yield.
- 1W / 1M / 3M change in basis points.
- Historical percentile over 1Y / 3Y / 5Y.

Signal logic for existing long-duration bond prices:

- Green: real yield trending lower.
- Yellow: sideways.
- Red: real yield trending higher.

Do not determine signal based only on whether the absolute yield is "high" or "low". Show both:

- **level**: attractive / neutral / low relative to history;
- **trend**: falling / flat / rising.

Primary source:
- Bank of Israel zero-coupon real yield curve.

---

### 2.6 מגמת תשואות ארוכות

This card is explicitly about momentum / trend rather than yield level.

For 10Y and long real yields, calculate:

- 5-trading-day change.
- 20-trading-day change.
- 60-trading-day change.
- 20D moving average.
- 60D moving average.

Suggested descriptive regime:

- Green: 5D < 0, 20D < 0, and current yield below 20D moving average.
- Yellow: conflicting horizons.
- Red: 5D > 0, 20D > 0, and current yield above 20D moving average.

Use basis points in the UI.

---

## 3. Overall market regime panel

Top-left or top-center should show a single summary panel:

### "מצב שוק האג״ח בישראל"

Do not issue an investment recommendation. Use descriptive labels only:

- **סביבה תומכת בירידת תשואות**
- **סביבה מעורבת**
- **סביבה תומכת בעליית תשואות**

Show:

- Number of green / yellow / red indicators.
- Main reasons.
- What changed since yesterday.
- Confidence level based on data completeness and indicator agreement.

### Suggested scoring implementation

Internal scores:

- Green = +1
- Yellow = 0
- Red = -1

Default weights:

- Policy rate: 15%
- CPI inflation: 15%
- Inflation expectations: 15%
- Israel risk premium: 20%
- Long real yield trend: 25%
- Long yield momentum: 10%

Important:

- Keep weights in database/config, not hard-coded throughout frontend.
- Show users the individual inputs and explanation.
- A score is an internal UI aggregation, not a prediction or investment score.

Suggested regime thresholds:

- Weighted score >= +0.35: supportive of lower yields.
- -0.35 < score < +0.35: mixed.
- score <= -0.35: supportive of higher yields.

These thresholds must be configurable.

---

## 4. Duration regime section

The dashboard should separately describe the environment by duration bucket:

### קצר: 0–3 years
Main sensitivity:
- Bank of Israel policy rate.
- Near-term inflation.
- Near-term rate expectations.

### בינוני: 3–7 years
Main sensitivity:
- Policy path.
- Inflation expectations.
- Government curve.
- Credit spread.

### ארוך: 7+ years
Main sensitivity:
- Long real yield.
- Fiscal deficit and government issuance.
- Global long yields.
- Israel risk premium.
- Credit spreads.

Each bucket receives a descriptive regime indicator with explanation.

---

## 5. Government yield-curve page

Create a dedicated page: **עקום ממשלתי**.

Charts:

1. Current nominal government yield curve.
2. Current real government yield curve.
3. Previous day overlay.
4. One month ago overlay.
5. One year ago overlay.
6. Curve change chart in basis points.

Tenors ideally standardized to:

- 1Y
- 2Y
- 3Y
- 5Y
- 7Y
- 10Y
- 15Y
- 20Y
- 30Y where source supports it.

Derived metrics:

- 2Y–10Y slope.
- 5Y–10Y slope.
- 5Y–15Y slope.
- Nominal-real spread / break-even.

Primary official source:
- Bank of Israel nominal and real zero-coupon curves.

---

## 6. Government debt supply / issuance page

Government bond supply is critical for long yields and must be included.

Use Ministry of Finance / Government Debt Management data.

Official open-data resources include:

- Domestic government debt data.
- Tradable domestic bond issuance auctions.
- Redemptions by bond type.
- Redemptions by indexation.
- Switch auctions.

The domestic tradable issuance dataset includes:

- issuance date;
- bond / series;
- term to maturity;
- redemption date;
- coupon;
- offered quantity;
- purchased quantity;
- average price;
- cutoff price;
- demanded amount;
- coverage ratio;
- average yield;
- cutoff yield.

Dashboard metrics:

- Planned / completed issuance by month.
- Auction demand / cover ratio.
- Issuance by nominal vs CPI-linked.
- Upcoming government redemptions.
- Net issuance estimate = gross issuance – redemptions.
- 3M rolling issuance pressure indicator.

Signal interpretation:

- Higher net supply / weak auction coverage can be a pressure factor for yields.
- Strong demand / lower net supply can be supportive.

Official dataset index:
- `https://data.gov.il/he/datasets/mof/goverment-domesticdebt`

---

## 7. Credit / infrastructure-bond page

Create dedicated page: **אג״ח תשתיות וממשלתיות**.

Initial watchlist:

- נמלי ישראל ב׳
- נמלי ישראל ד׳
- חברת החשמל 31
- חברת החשמל 34
- חברת החשמל 36
- חברת החשמל 37
- מקורות 11
- נתיבי גז ד׳

Architecture must allow adding securities without code changes.

For each bond display:

- Issuer.
- Series.
- Security number / TASE identifier.
- Rating.
- Price.
- Gross yield to maturity.
- Real / nominal classification.
- CPI-linked yes/no.
- Coupon.
- Duration.
- Redemption date.
- Next payment date.
- Government benchmark tenor.
- Interpolated government benchmark yield.
- Credit spread in basis points.
- Spread 1D / 1W / 1M change.
- Spread percentile over 1Y.
- Yield per unit duration (display only as a custom heuristic, clearly labeled non-standard).
- Trading volume / liquidity proxy where available.

### Critical calculation: government benchmark spread

Do **not** simply subtract the yield of one arbitrary nearby bond.

Preferred method:

1. Obtain real or nominal government zero curve depending on corporate bond type.
2. Interpolate the government yield at the corporate bond’s duration / maturity proxy.
3. `credit_spread_bps = (corporate_ytm - interpolated_government_yield) * 10000`

For CPI-linked corporate debt, compare with the **real government curve**.
For nominal corporate debt, compare with the **nominal government curve**.

Store both:

- interpolated spread;
- nearest-benchmark spread for easy human verification.

---

## 8. Bond detail page

Example route:

`/bonds/israel-ports-d`

Sections:

1. Current market summary.
2. Yield / price / spread history.
3. Benchmark government yield history.
4. Decomposition:
   - government yield contribution;
   - credit-spread contribution.
5. Scenario calculator.
6. Cash-flow schedule.
7. Issuer credit fundamentals.
8. Recent issuer reports / rating updates.

### Scenario calculator

Inputs:

- Investment amount.
- Holding period: 1M / 3M / 6M / 12M / maturity.
- Government yield change in bps.
- Credit spread change in bps.
- Expected inflation.

Outputs:

- Approximate price effect using modified duration.
- Optional convexity correction if available.
- Coupon accrued / received.
- Estimated indexation.
- Estimated total return.

Formula approximation:

`Price change % ≈ -ModifiedDuration × ΔYield + 0.5 × Convexity × (ΔYield)^2`

If convexity is unavailable, clearly label duration-only output as an approximation.

Total yield change:

`Δ corporate yield = Δ government benchmark yield + Δ credit spread`

This decomposition is essential.

---

## 9. Global risk monitor

Add a compact page or panel with external factors that can move Israeli long yields:

- U.S. 2Y Treasury.
- U.S. 10Y Treasury.
- U.S. 10Y real yield / TIPS.
- U.S. 2s10s.
- MOVE index.
- USD/ILS.
- Brent oil.

Optional later:

- DXY.
- S&P 500.
- VIX.

The dashboard must not infer causality simply from correlation. It should show changes and context.

---

## 10. "מה השתנה היום?" engine

Generate an automatic daily descriptive summary based entirely on stored data.

Example:

> "התשואה הריאלית ל-10 שנים ירדה היום ב-7 נ״ב, ציפיות האינפלציה כמעט ללא שינוי והשקל התחזק. במקביל מרווחי האשראי של אג״ח התשתיות נותרו יציבים. סביבת השוק הפכה מעט תומכת יותר באג״ח ארוכות."

Rules:

- Never invent a reason if data only shows correlation.
- Use "במקביל" / "על רקע" rather than "בגלל" unless the causal link is sourced.
- Every sentence must be reproducible from stored metrics.
- Show the exact input changes used to generate the text.

---

## 11. Historical snapshots

This is mandatory from the MVP.

Persist daily end-of-day snapshots for every tracked metric and bond.

Why:

- Trends.
- Backtesting regime rules.
- Historical percentiles.
- "What changed" comparisons.
- Future signal validation.

Do not overwrite historical observations when new values arrive.

Use source observation date separately from ingestion timestamp.

---

## 12. Suggested technical architecture

Preferred stack, consistent with the user's existing Cloudflare projects:

### Frontend

- React.
- TypeScript.
- Vite.
- RTL-first Hebrew interface.
- Responsive desktop dashboard first; mobile supported.
- Recharts or equivalent existing chart library already in project.

### Backend

- Cloudflare Worker.
- TypeScript.
- REST endpoints.

### Database

- Cloudflare D1.

### Scheduled ingestion

- Cloudflare Cron Triggers.
- Separate jobs by source / update frequency.

### Optional cache

- Cloudflare KV only if needed for expensive public API responses.
- D1 remains source of truth for historical data.

### Deployment

- Cloudflare build/deploy workflow.

If an existing repo already has conventions, Codex must inspect and follow them rather than force a new architecture.

---

## 13. Database schema

Use migrations. Never modify production schema manually without a migration.

### `data_sources`

Fields:

- `id`
- `key` unique
- `name`
- `base_url`
- `source_type`
- `is_official`
- `enabled`
- `last_success_at`
- `last_error_at`
- `last_error_message`
- `created_at`
- `updated_at`

### `macro_series`

Metadata for each series.

- `id`
- `key` unique
- `name_he`
- `name_en`
- `category`
- `unit`
- `frequency`
- `source_id`
- `source_series_code`
- `is_active`
- `created_at`
- `updated_at`

Examples:

- `boi_policy_rate`
- `cpi_index`
- `cpi_yoy`
- `infl_exp_1y`
- `real_yield_10y`
- `nominal_yield_10y`
- `usd_ils`
- `israel_risk_proxy`

### `macro_observations`

- `id`
- `series_id`
- `observation_date`
- `value`
- `source_timestamp`
- `ingested_at`
- `revision_number`
- `raw_payload_hash`

Unique key:

`(series_id, observation_date, revision_number)`

Provide a view/helper for latest revision.

### `bonds`

- `id`
- `issuer_key`
- `issuer_name_he`
- `series_name_he`
- `tase_security_id`
- `bond_type`
- `indexation_type`
- `coupon_rate`
- `issue_date`
- `maturity_date`
- `rating`
- `rating_agency`
- `active`
- `created_at`
- `updated_at`

### `bond_market_observations`

- `id`
- `bond_id`
- `observation_date`
- `price`
- `ytm`
- `duration`
- `modified_duration`
- `convexity`
- `accrued_interest`
- `volume`
- `government_benchmark_yield`
- `credit_spread_bps`
- `nearest_benchmark_yield`
- `nearest_benchmark_spread_bps`
- `source_id`
- `ingested_at`

Unique:

`(bond_id, observation_date)`

### `signal_definitions`

- `id`
- `key`
- `name_he`
- `description_he`
- `weight`
- `green_rule_json`
- `yellow_rule_json`
- `red_rule_json`
- `enabled`
- `updated_at`

### `signal_snapshots`

- `id`
- `signal_key`
- `observation_date`
- `status` (`green`, `yellow`, `red`, `unknown`)
- `score`
- `value_json`
- `explanation_he`
- `created_at`

### `market_regime_snapshots`

- `id`
- `observation_date`
- `weighted_score`
- `regime`
- `green_count`
- `yellow_count`
- `red_count`
- `confidence`
- `summary_he`
- `created_at`

### `government_auctions`

Fields based on Ministry of Finance dataset:

- auction date;
- bond;
- series;
- maturity;
- coupon;
- offered quantity;
- purchased quantity;
- demanded amount;
- coverage ratio;
- average price;
- cutoff price;
- average yield;
- cutoff yield;
- source ingestion metadata.

### `ingestion_runs`

- `id`
- `job_key`
- `started_at`
- `completed_at`
- `status`
- `records_read`
- `records_written`
- `error_message`

---

## 14. Backend API

Suggested routes:

### Macro

- `GET /api/macro/overview`
- `GET /api/macro/series/:key`
- `GET /api/macro/yield-curve?type=real&date=`
- `GET /api/macro/yield-curve?type=nominal&date=`
- `GET /api/macro/inflation`
- `GET /api/macro/rates`
- `GET /api/macro/risk`

### Signals

- `GET /api/signals/current`
- `GET /api/signals/history`
- `GET /api/regime/current`
- `GET /api/regime/history`

### Bonds

- `GET /api/bonds`
- `GET /api/bonds/:id`
- `GET /api/bonds/:id/history`
- `GET /api/bonds/:id/scenario`
- `GET /api/bonds/spreads`

### Government debt

- `GET /api/government/issuance`
- `GET /api/government/auctions`
- `GET /api/government/redemptions`

### System / provenance

- `GET /api/sources/status`
- `GET /api/ingestion/status`

Every endpoint must return provenance metadata where relevant.

---

## 15. Ingestion jobs

### Job A — Bank of Israel policy rate

Frequency:
- daily is sufficient;
- additionally refresh immediately after scheduled decision time if easy.

### Job B — Bank of Israel statistical series

Frequency:
- daily after market / official data updates.

Pull:
- nominal zero curve;
- real zero curve;
- inflation expectations;
- USD/ILS if desired.

### Job C — CBS CPI

Frequency:
- daily check, but only new observation when released.

### Job D — Ministry of Finance debt datasets

Frequency:
- daily.

### Job E — Corporate bond market data

Frequency for MVP:
- end of day.

Later:
- intraday if a licensed/reliable data source becomes available.

Important:
- Do not scrape sites in violation of terms.
- Prefer official/public APIs or licensed data.
- Implement source adapter interfaces so data providers can be replaced.

---

## 16. Source adapter design

Define a standard adapter interface.

Example concept:

```ts
interface MarketDataAdapter<T> {
  fetch(): Promise<T[]>;
  normalize(raw: unknown): T[];
  validate(rows: T[]): ValidationResult;
}
```

Adapters:

- `BankOfIsraelInterestAdapter`
- `BankOfIsraelSeriesAdapter`
- `CbsCpiAdapter`
- `GovDebtAuctionAdapter`
- `CorporateBondAdapter`

Raw responses should optionally be stored or hash-recorded for provenance/debugging.

---

## 17. Data quality rules

Mandatory.

For every series:

- expected frequency;
- stale-data threshold;
- min/max plausible values;
- missing observation handling;
- revision handling.

Examples:

- policy rate: flag stale after 45 days only if next decision has passed;
- daily yields: flag stale after 2 business days;
- CPI: monthly frequency; do not flag simply because there is no daily update.

Never calculate a green/red signal from stale or missing critical data.
If key data is stale:

- mark status as `unknown`;
- show gray card;
- lower regime confidence.

---

## 18. UI / UX specification

### General

- Hebrew RTL.
- Light, clean financial-dashboard design.
- Bright but restrained colors.
- Green / yellow / red used primarily for status, not decoration.
- Always show units.
- Basis points should appear as `נ״ב`.
- Tooltips explain financial terms.

### Dashboard top

1. Header: "שוק ישראל — מאקרו, ריבית ואג״ח".
2. Last updated timestamp.
3. Overall regime panel.
4. Six primary traffic-light cards.

### Below fold

1. Real yield curve.
2. Nominal yield curve.
3. Inflation expectations.
4. Corporate credit spreads.
5. Government issuance pressure.
6. Risk monitor.
7. "מה השתנה היום?".

### Card behavior

Clicking any signal card opens a detail drawer/page with:

- current value;
- history;
- exact signal rule;
- source;
- latest source update;
- explanation.

Transparency is mandatory.

---

## 19. MVP phases

### Phase 1 — foundation

Deliver:

- React/TypeScript shell.
- D1 migrations.
- source tables.
- observation tables.
- ingestion status.
- Bank of Israel policy rate.
- CBS CPI.
- real government yield curve.
- nominal government yield curve.
- six dashboard cards, with unavailable cards clearly marked where source is not yet implemented.
- daily snapshot framework.

### Phase 2 — signals + history

Deliver:

- configurable signal rules.
- daily signal snapshots.
- overall market regime.
- trend calculations.
- historical charts.
- "what changed today" rules engine.

### Phase 3 — corporate bonds

Deliver:

- bond master table.
- initial infrastructure watchlist.
- daily market observations.
- interpolated government benchmark.
- credit spreads.
- bond detail page.

### Phase 4 — debt supply + external risk

Deliver:

- Ministry of Finance issuance data.
- auction coverage.
- redemptions.
- net-supply indicator.
- U.S. Treasury / real yield / MOVE / Brent risk monitor.

### Phase 5 — scenario / analysis

Deliver:

- duration + convexity scenario calculator.
- 1M/3M/6M/12M holding-period estimates.
- government-yield vs credit-spread decomposition.
- compare bonds.

---

## 20. Acceptance criteria — MVP

MVP is complete only when:

1. Dashboard loads with no hard-coded current market values.
2. Current Bank of Israel rate is fetched from an official source.
3. CPI is fetched from CBS data.
4. Real and nominal government yield data are stored historically.
5. Each source has ingestion status and timestamps.
6. Six top cards render with green/yellow/red/unknown state.
7. Signal rules are centralized/configurable.
8. Stale data cannot silently produce a signal.
9. Daily observations are persisted and not overwritten.
10. User can view at least 90 days of available history after enough snapshots exist; backfill official history where practical.
11. UI works in Hebrew RTL.
12. Tests cover signal calculations, yield/spread calculations, missing data, and stale data.
13. Typecheck passes.
14. Production build passes.
15. No secrets committed.

---

## 21. Testing requirements

### Unit tests

- CPI MoM / YoY calculations.
- basis-point conversion.
- real/nominal curve interpolation.
- spread calculation.
- moving averages.
- signal thresholds.
- weighted regime score.
- stale data behavior.
- scenario duration calculation.

### Integration tests

- source adapter normalization with fixture payloads.
- D1 observation upserts / revision behavior.
- API current/latest queries.
- signal snapshot generation.

### Frontend tests

- cards render all states.
- RTL labels.
- missing source status.
- charts do not render misleading zeroes for missing values.

---

## 22. Security / operations

- Public dashboard endpoints: read-only.
- Any future admin/source configuration endpoints require auth.
- Secrets in Cloudflare secrets only.
- External fetch timeouts and retries.
- Rate-limit external source calls.
- Log ingestion failures without leaking credentials.
- Preserve last known good observation but visibly mark it stale.

---

## 23. Provenance requirements

Every metric shown to the user must be traceable.

At minimum store/show:

- Source name.
- Source URL or series identifier.
- Observation date.
- Ingestion timestamp.
- Whether value is direct or derived.
- For derived values: formula / inputs.

For credit spread, show:

- corporate YTM;
- benchmark government yield;
- benchmark method;
- resulting spread.

---

## 24. Important financial semantics

The implementation and copy must preserve these distinctions:

### Policy rate != bond yield

Bank of Israel rate influences the curve but does not mechanically set long yields.

### Yield to maturity != realized holding-period return

If a user sells before maturity, realized return depends on:

- purchase price;
- sale price;
- coupon;
- accrued interest;
- CPI indexation;
- changes in government yield;
- changes in credit spread.

### Corporate yield decomposition

For analysis:

`Corporate Yield ≈ Government Benchmark Yield + Credit Spread`

### CPI-linked bond

Real yield and inflation indexation must be shown separately when estimating outcomes.

Do not display nominal equivalent return without explicitly labeling inflation assumption.

---

## 25. Initial data sources confirmed for implementation research

### Bank of Israel

- Public policy rate API exists:
  `https://www.boi.org.il/PublicApi/GetInterest`
- Bank of Israel supports SDMX series queries and formats such as CSV.
- Bond statistics pages publish nominal and real zero curves and corporate yield margins.

### Israel CBS

- Price-index API exists.
- CPI data are available under Consumer Prices Index chapter.
- API documentation supports structured query parameters and multiple formats.

### Ministry of Finance / data.gov.il

- Domestic government debt datasets exist.
- Tradable domestic bond auction dataset includes issuance quantities, demand, cover ratios, prices, and yields.
- Redemption and switch-auction datasets are also available.

### TASE / corporate bonds

For corporate bond market data, first inspect whether the existing project already has a licensed/API data source. If not:

1. Research official TASE data access / permitted interfaces.
2. Do not rely on fragile scraping as the production architecture.
3. Build the adapter abstraction and permit a temporary manual/import fallback for the watchlist if necessary.

The first MVP must not be blocked solely because the corporate-bond source requires a later data-provider decision. Macro/government-yield features should ship first.

---

## 26. Codex implementation instructions

Before coding:

1. Inspect the entire current repository structure, package scripts, Cloudflare config, D1 migrations, existing API conventions, testing setup, and UI design system.
2. Read any existing `CHATGPT_HANDOFF.md`, README, architecture docs, and task specs.
3. Reuse existing conventions wherever practical.
4. Do not delete or rewrite unrelated functionality.
5. Identify what can be delivered safely as the first vertical slice.

Implementation priority:

1. Foundation + schema.
2. Bank of Israel rate adapter.
3. CBS CPI adapter.
4. Bank of Israel yield-curve adapter.
5. Snapshot history.
6. Signal engine.
7. Dashboard UI.
8. Tests.

For external APIs:

- validate response schemas;
- use fixture-based tests;
- handle downtime and malformed responses;
- do not silently substitute hard-coded values.

---

## 27. Required completion workflow

Codex must not stop at code changes.

At completion:

1. Run all relevant tests.
2. Run typecheck.
3. Run production build.
4. Run any existing lint command.
5. Verify D1 migrations locally.
6. If production deployment is part of the existing project workflow and credentials are available, deploy only if the task/repo conventions explicitly call for it; otherwise document the exact deploy command and blockers.
7. Update/create **`CHATGPT_HANDOFF.md`** in the repository root.

`CHATGPT_HANDOFF.md` must include:

- Date/time.
- Phase implemented.
- Files added/changed.
- Architecture decisions.
- Database migrations.
- APIs / sources integrated.
- Signal formulas implemented.
- Tests added.
- Exact verification results.
- Known limitations.
- External data-source blockers.
- Cloudflare configuration/secrets still required.
- Recommended next phase.

Then:

8. `git status` and review changes.
9. Commit all task-related changes with a clear commit message.
10. Push the commit to the current Git remote.
11. Record the commit hash and push result in `CHATGPT_HANDOFF.md` **before the final handoff commit if needed**; if this requires a second tiny handoff commit, make it and push it as well.

Do not force-push.
Do not rewrite history.
Do not commit secrets or local `.dev.vars`.

---

## 28. Suggested first implementation milestone

**Phase 1A — Macro/Rates Core**

Build a real, working dashboard with:

- Bank of Israel policy rate.
- CPI YoY / MoM.
- nominal government zero curve.
- real government zero curve.
- long real yield card.
- long-yield trend card.
- daily observation storage.
- source status / stale-data handling.
- 4 working signal cards plus 2 explicit "source pending" cards if risk-premium / expectations ingestion is not yet complete.

This is preferable to using fake data just to make all six cards appear complete.

---

## 29. Definition of a good first screen

A user opening the dashboard should understand within 10 seconds:

1. Current Bank of Israel rate and direction.
2. Current inflation and direction.
3. Current long real yield and direction.
4. Whether inflation expectations are anchored.
5. Whether Israel risk premium is improving or worsening.
6. Whether long bond yields are currently trending up or down.
7. What changed today.
8. When each datapoint was last updated.

The dashboard should feel like an Israeli fixed-income analyst's morning monitor, not a generic finance template.

