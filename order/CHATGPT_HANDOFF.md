# ChatGPT Handoff - Israel Macro/Rates Dashboard

## Phase 1A / 1B foundation

The Phase 1A and Phase 1B implementation described below remains in place. Phase 1B deterministic change-summary sentences have since been localized to Hebrew and have Hebrew-output tests.

## Phase 1B implementation

Implemented locally in `bond dashboard` while retaining Phase 1A policy-rate, CPI, curve, source-provenance, and revision-history behavior.

- Added additive D1 migration `migrations/0002_phase_1b.sql`: BOI expectations series, BOI USD/ILS, FRED DGS10/DFII10, primary weights and proxy thresholds, `derived_observations`, `regime_snapshots`, and `regime_snapshot_components`. Seeds contain definitions/settings only; observed-value table remains empty.
- Added adapters in `worker/sources.ts` for BOI expectation workbook, BOI live FX API and SDMX history, and FRED CSV. Parsers validate source headers/fields, reject malformed payloads, skip FRED missing-value dots and preserve business-day gaps. Existing BOI rate, CBS CPI, and yield-curve adapters remain active.
- Scheduled ingestion checks each source daily. Expectations preserve the workbook's publication timestamp and actual periodic observation dates; repeated unchanged payloads do not add revisions. FRED retains a 120-calendar-day window. Source statuses use configured stale windows.
- Added business-observation lookback calculations for USD/ILS 1/5/20/60 changes and FRED yield 1/5/20/60 changes. Added the Israel Risk Conditions Proxy from only the verified FX, BOI real curve, and IL-US real-yield differential inputs. Available components are averaged; missing values are excluded. Thresholds are stored in D1. It is explicitly not CDS.
- Regime calculation now renormalizes available weighted signals and reports coverage; context-only series have zero weight. Scheduled daily history writes use insert-ignore semantics and retain per-signal components. Derived differential observations also use insert-ignore.
- Expanded overview data, added the requested Phase 1B API routes, deterministic observation-based change bullets, market-context and expectations panels, proxy labeling/provenance, regime coverage display, and a regime-history table. Existing curve and CPI panels remain.
- Added tests for FX parsing and missing dates, FRED `.`/business-day handling, expectations tenor mapping/missing workbook header, risk classification, lookback behavior, and weighted regime coverage.
- Updated `README.md` with IDs, sources, cadences, freshness, formulas, schedule, migration, and proxy limitations.

## Official sources

- BOI policy: `https://www.boi.org.il/PublicApi/GetInterest`
- CBS CPI: `https://api.cbs.gov.il/index/data/price?id=120010&format=json&download=false&lang=en&last=240&PageSize=300&coef=true`
- BOI nominal curve: `https://boi.org.il/boi_files/Statistics/shcd08_e.xls`
- BOI real curve: `https://boi.org.il/boi_files/Statistics/shcd07_e.xls`
- BOI expectations workbook: `https://kamakama.gov.il/boi_files/Statistics/shcf10_e.xls`; publication page: `https://boi.org.il/en/economic-roles/statistics/inflation-expectations-and-inflation-forecasts/inflation-expectations-and-inflation-forecasts/`
- BOI representative USD rate: `https://boi.org.il/PublicApi/GetExchangeRate?key=USD`; historical SDMX series `RER_USD_ILS` at `https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS`
- FRED `DGS10`: `https://fred.stlouisfed.org/series/DGS10`; FRED `DFII10`: `https://fred.stlouisfed.org/series/DFII10`

## Verification on 2026-10-02

- Live adapter check passed against all nine feeds: BOI policy, CBS CPI, BOI nominal and real curves, BOI expectations, BOI live USD fixing, BOI SDMX USD history, FRED DGS10, and FRED DFII10. The check parsed payloads with production parsers and logged only feed names and row counts, not observed market values.
- `npm run typecheck` passed.
- `npm test` passed after Phase 1B: 15 tests across 3 files. (The latest Phase 1C run is listed below.)
- `npm run build` passed.
- `npx wrangler deploy --dry-run` passed; Worker, D1 binding, and assets resolved.
- Applied all SQL migrations to in-memory SQLite. Schema/seeds succeeded, primary weights sum to 1.0, and observed macro rows remain at zero.

## Limitations / follow-up

- `npm run db:migrate:local` could not be exercised because Wrangler's local workerd startup previously crashed in this Windows environment; the SQL migrations were instead applied directly with SQLite. The Worker was not interactively run against local D1.
- Snapshot history is an append-only daily record; no formal recalculation/revision workflow was added. The regime history UI includes a score/coverage SVG chart and the stored top-positive/top-negative contributors in its table.
- Deployment was not performed. Wrangler dry-run is not a live Cloudflare deployment.

## Git / remote status

At the end of the original Phase 1C implementation, the dashboard directory had no Git repository. This historical status was superseded by the authorized GitHub/frontend addendum work below. The nearby RAGOps repository remains unrelated and was not modified.


## Phase 1C implementation

### Implemented

- Added `migrations/0003_phase_1c_bonds.sql`, an additive migration for issuer metadata, `bond_master`, revisioned `bond_market_observations`, `bond_benchmark_observations`, agency-specific `bond_ratings`, and revisioned `bond_cashflows`. Seeds contain five requested issuer groups only. There are zero bond securities and zero market observations seeded.
- Added `shared/bonds.ts` calculations for signed bp spreads, spread/duration heuristic, CPI/nominal-specific curve selection, duration-based interpolation, maturity fallback, nearest fallback, quote age, and filtering. Added tests for exact/interpolated/fallback/unavailable benchmarks, linkage-specific curves, positive/negative/null spreads, invalid duration, date gaps, and filters.
- Added `worker/bond-source.ts` as an explicit source-pending adapter/status boundary. Since no TASE entitlement/API schema is configured, it does not fetch or insert market data. Added source status, paginated/filterable bond APIs, individual detail/history/benchmark endpoints, relative-value/spread routes, and government curve routes.
- Added daily idempotent benchmark refresh from stored observations and the official BOI real/nominal curves. Historical 1/5/20/60-session spread changes use actual stored benchmark observations. There is no fake quote filling or calendar interpolation.
- Added the RTL screener section with issuer/linkage/rating/duration/maturity/volume/staleness filters, sorting, issuer-colored yield/duration and spread/duration scatter plots, conditional median cards, quote-age/mismatched-date warnings, and a detail drawer backed by source/API history. It presents no bond rows while the market source is pending.
- Localized deterministic global change summaries to Hebrew. Bond-spread bullets are thresholded, limited to two, data-derived, and covered by an exact Hebrew output test. No automated attractiveness, ranking, or trade language is generated.
- Updated `README.md` with source/licensing findings, model and formulas, source-pending behavior, API paths, freshness, and steps to enable an approved adapter.

### Source and licensing decision

The verified production candidate is the TASE DATA HUB API. Official guide: `https://content.tase.co.il/media/l5xjhjmz/2000_api_guide_eng.pdf`. It requires Developer Portal registration, an app and API key, product registration and (for paid products) approval; submitting a paid-product request does not automatically enable access. Product API schemas and update schedules are available through the authenticated portal. The official product list `https://content.tase.co.il/media/4imn13pz/2001_api_pricelist_2026_eng.pdf` lists paid bond/security products, including Extended Bond Data, bond amortization schedules and EoD/history products; pricing is monthly and internal-use/distribution rights differ. No TASE account, entitlement, API key, or terms have been supplied. Therefore current quotes, yields, volume, duration, ratings and active issue discovery remain unavailable and blank. Public TASE HTML is not scraped.

Midroog's IEC issuer/series page is recorded as an official rating source candidate: `https://www.midroog.co.il/ArticlePage.aspx/company/0e5623f8-b30f-4a77-b4b0-d171d48259f6/series`. It is not used to seed ratings or replace licensed trade data. Active listings for all requested issuers have not been source-verified, so the database does not hard-code the requested series numbers/letters as live securities.

### Phase 1C verification

- `npm run typecheck` passed.
- `npm test` passed: 18 tests across 4 files.
- `npm run build` passed for the Phase 1C tree.
- `npx wrangler deploy --dry-run` passed; Worker assets and D1 binding resolved.
- SQLite in-memory migration check ? Phase 1C migration applied; 6 bond tables created, five issuer metadata rows present, `bond_master` empty, and source status states license/API key pending.
- Live bond feed adapter test ? intentionally not possible: no authorized product entitlement or authenticated product schema exists. Official TASE pricing and API-guide pages were checked; no market page scraping was used.
- Local Wrangler D1 runtime limitation from Phase 1B remains. No production deployment was performed.

### Unresolved before bond-market observations can appear

- Obtain the appropriate TASE DATA HUB product approvals and clarify internal-use/display rights and any distribution restrictions.
- Obtain the authenticated API specification for security-master discovery, bond market fields/history, amortization schedules, and the update cadence; then implement and live-verify the actual response adapter.
- Verify issuer-series activity and ratings against the entitled source/disclosures before inserting bond master or rating rows. Backfill only history allowed by the selected product.
- Current Phase 1C UI labels and some explanatory screener copy are English while direction is RTL; the deterministic change engine itself is localized to Hebrew. Full Hebrew localization of all new screener chrome is still outstanding.

## Git / remote status

At the end of the original Phase 1C implementation, `git rev-parse --show-toplevel` returned "not a git repository." The later GitHub/frontend addendum below records the current initialized dashboard repository and its Git actions. RAGOps was not touched.

## GitHub / Cloudflare frontend connection addendum — 2026-10-02

### Frontend and Worker changes

- Added `src/lib/api.ts` as the shared typed JSON client. It applies the build-time `VITE_API_BASE_URL` once, normalizes path slashes, and turns network, HTTP, and invalid-JSON failures into surfaced API errors. All browser API requests, including bond detail/history and the overview, now use this client; the overview uses `/api/overview` (the Worker retains `/api/macro/overview` as a backwards-compatible route).
- Added frontend response interfaces in `src/lib/api-types.ts`, Vite environment typing in `src/vite-env.d.ts`, `.env.example`, and an ignored local `.env.local` with `VITE_API_BASE_URL=http://localhost:8787`. `.gitignore` explicitly ignores `.env.local`; `git check-ignore .env.local` passed. Overview and health payloads are checked at runtime for required non-null top-level structure before the UI treats them as typed data.
- The app checks `/api/health` at initial load and shows API checking/connected/unavailable state. Failed overview loads retain any prior successful data with a warning; first-load failures show an error and loading placeholders. Bond detail history now has explicit loading and error messages and avoids rendering an empty chart as zero data. Existing source panels continue to report stale and not-yet-available source data distinctly.
- Added `/api/overview` as an alias to the established macro overview route. `/api/health` performs a `SELECT 1` against D1 and returns only `ok`, service name, timestamp, and database reachable/unavailable status. D1 diagnostics and secret/environment values are not returned.
- Added exact-origin CORS allowlisting from Worker `ALLOWED_ORIGINS`, `GET`/`OPTIONS` support, preflight responses, `Vary: Origin`, and no arbitrary Origin reflection. The local Wrangler defaults allow `http://localhost:5173` and the specified Pages origin `https://bond-analyzer-av2.pages.dev`; production origins can be set in Worker environment configuration. Unlisted origins receive 403 without an allow-origin header.
- Added `src/lib/api.test.ts` and `worker/api.test.ts` for API URL/configuration and error handling, health success/failure, secret-safe health response, CORS preflight, allowed origin, and rejected origin.
- Updated `README.md` with the GitHub repository, Pages build settings/root directory, Worker/D1 architecture, environment variables, CORS, manual deployment/migration order, and the fact that Pages deployment is a static React build. This app currently uses hash anchors rather than nested client-side routes, so no custom Pages SPA rewrite is required.

### Git and repository identity

- Verified the working directory as `C:\Users\Liorkale\Documents\Claude\Projects\StockAnalitics\bond dashboard`, containing the dashboard package, Vite app, Worker, D1 migrations, and both Phase 1C specifications. It is separate from sibling `RAGOps`.
- Initialized Git in this dashboard directory, set branch `main`, and added `origin` exactly as `https://github.com/Comeon2022/bond-analyzer.git`. `git rev-parse --show-toplevel` resolves to the dashboard folder; `git remote -v` shows only the authorized bond-analyzer remote.
- `git ls-remote --symref origin HEAD` and `git ls-remote --heads origin` returned no refs (empty remote at check time); there was no history to fetch/reconcile. No force push is planned. No Git command was run in the RAGOps folder and no RAGOps file was modified.
- Commit and push will be recorded here after final verification.

### Verification

- `npm run typecheck` passed after the API/CORS changes.
- `npm test` passed: 25 tests across 6 files, including frontend client/schema validation and Worker CORS/health suites. This includes all existing Phase 1A/1B/1C unit tests.
- `VITE_API_BASE_URL=https://bond-analyzer-api.example.workers.dev npm run build` passed as a sample production configuration. `npx wrangler deploy --dry-run` passed and resolved the Worker, D1, assets, and `ALLOWED_ORIGINS` bindings. `.env.local` is ignored and contains only the local Worker URL; `.env.local` is absent from the Git candidate set. No credentials or source tokens are configured in frontend variables. Primary implementation commit: `514fb47f3d739ca57c3e7170ea5782947f988b3e` (`Implement Israel bond analyzer dashboard`). It is the initial dashboard repository commit and was pushed successfully to `origin/main`; the branch now tracks `origin/main`. The handoff-only commit `2e9deb3d62addcd628ad4ce0df68fd4468940a7a` was also pushed to `origin/main`. Runtime payload-shape validation was added afterward, passed all checks, and was pushed in commit `53d94329e1e460b9ca9a8415f7094b19ccc0dbbb`.
- No production Worker deployment, remote D1 migration, source ingestion, or Pages deployment was performed. The Wrangler D1 database ID remains the pre-existing placeholder; configure the real D1 database and apply remote migrations before deployment.

### Manual Cloudflare steps

1. Create/identify the production D1 database, update `database_id`, and apply migrations remotely.
2. Deploy the Worker; configure `ALLOWED_ORIGINS` with the exact Pages origin and verify `/api/health` plus `/api/overview`.
3. Connect Pages to `Comeon2022/bond-analyzer`, branch `main`, React (Vite), command `npm run build`, output `dist`, blank root directory. Set Pages `VITE_API_BASE_URL` to the deployed Worker origin and rebuild.
4. Verify browser loading, source staleness/source-pending states, and no CORS errors. TASE market data remains source-pending until licensed API entitlement and schema are supplied, as documented above.

## UTF-8 and frontend API diagnostics — 2026-10-02

- Audited the deployed Pages HTML and bundle. The HTML returned HTTP 200 with UTF-8 content and already declared `<meta charset="UTF-8">`; the deployed JavaScript contained 143 common mojibake-pattern matches and no Hebrew characters. Corrected the damaged Hebrew literals in the frontend and Worker UI-facing strings. Added an explicit UTF-8 charset declaration/title/description to `index.html`; corrected the RTL/timezone footer and localized the remaining screener labels, source names, risk explanations, and pending-source text.
- The source scan found no mojibake markers in `src`, `worker`, `shared`, or `index.html` after repair (the close-button `×` is intentional). The production HTML title and description now contain proper Hebrew.
- Confirmed the frontend reads `import.meta.env.VITE_API_BASE_URL` at build time. Built with a sample Worker URL and verified that value appears in the emitted frontend bundle. API errors now identify `HTTP <status>: <response detail>` and network errors identify endpoint plus the `VITE_API_BASE_URL`/Worker availability check; API failures retain the last valid data where available.
- The app distinguishes a failed Worker connection, an available Worker with unavailable database, general API/HTTP errors, and successful connectivity with no observations yet. The no-data banner appears only after health and overview succeed and macro card observations are empty.
- Verification: `npm run typecheck` passed; `npm test` passed (25 tests across 6 files); `VITE_API_BASE_URL=https://bond-analyzer-api.example.workers.dev npm run build` passed. The sample value is for build-time configuration verification only, not a deployed endpoint.
- The Pages site was inspected before changes; its previously published bundle was corrupted. Pushing these source changes to `main` will trigger the repository's configured Pages build if that integration is active. No direct production deployment was performed.
- Repository identity rechecked before Git actions: dashboard root and `https://github.com/Comeon2022/bond-analyzer.git`, branch `main`; no RAGOps repository was touched. Committed and pushed as `8749c9fb80ff81e952b9e769e275855973d22053` (`Fix Hebrew encoding and API status handling`) to `origin/main`. A post-push check still returned the previous Pages asset `/assets/index-DMzSSSbf.js` (41 mojibake-pattern matches, no Hebrew characters); the Pages deployment has not propagated at the time of this check.
## Phase 1D — BOI free credit data source audit — 2026-10-02

- Phase 1D specification and this handoff are located in `order/` as requested. The dashboard repository remains rooted here and is configured for `bond-analyzer-db` in the current working tree.
- Verified the official BOI bonds/yields page states that its source data include corporate yield margins by rating group and exchange-sector grouping: https://www.boi.org.il/roles/statistics/makamandbonds/yield/ . The page attributes bond observations to TASE trading data and describes these as aggregate group observations; this supports the aggregate-credit use case but does not authorize individual-bond scraping.
- Queried BOI's public SDMX structure endpoints (official, no authentication) and identified the dataflow `BOI.STATISTICS:SECDWH(1.0)`, named “Securities TASE DWH”, with daily aggregate security data and dimensions including `DATA_TYPE`, `COMP_CATEGORY`, `SEC_RANK_GROUP`, and `ISSUER_SECTOR`. Its documented metadata says the values aggregate groups, not individual securities.
- The official series-code codelist includes `DWH_SRC_0298` (“מרווח התשואות בין מדד תלבונד 60 לאג״ח ממשלתיות צמודות בריבית קבועה”), plus rating/sector spread series. Rating examples returned by the codelist include `DWH_SRC_0388` (AAA, nominal), `DWH_SRC_0393` (AA, nominal), `DWH_SRC_0408` (A, nominal), `DWH_SRC_0423` (BBB, nominal), and CPI-linked equivalents `DWH_SRC_0518`, `DWH_SRC_0523`, `DWH_SRC_0528`, `DWH_SRC_0533`. Sector series include banking, biotech, trade and services, financial services, industry, insurance, investment/holdings, oil and gas exploration, and real estate/construction. Labels must continue to come from BOI metadata, not hard-coded inference.
- Blocker: although BOI SDMX structure/codelist requests succeeded, tested requests for observations from the `SECDWH` dataflow returned HTTP 404, and the official page's direct HTML response was a Radware loader rather than the page payload. Therefore no live observations, dates, or series values were retrieved or independently verified. No Phase 1D ingestion, database migration, UI/API routes, or individual-bond observations were added in this turn. Deploying or reporting populated credit APIs without the actual BOI observations would violate Phase 1D's no-fabrication requirement.
- Verification of the existing repository state: `npm run typecheck` passed; `npm test` passed (25 tests across 6 files); `npm run build` passed; `npx wrangler deploy --dry-run` passed and resolved `bond-analyzer-db`, Worker assets, and `ALLOWED_ORIGINS`. These checks validate the pre-Phase-1D code only.
- No Worker deployment, migration application, credit API verification, commit, or push was performed because Phase 1D implementation could not be safely completed without a working official observation endpoint. Existing local moves/edits remain uncommitted, including the current `wrangler.toml` D1 configuration change. The repository identity is `bond-analyzer` on `main`; no RAGOps repository was touched.
## Phase 1D free BOI credit ingestion implementation — 2026-10-02

### Implemented

- Added `worker/credit.ts` for the official BOI SECDWH bulk CSV endpoint (`https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/SECDWH/1.0/?format=csv&lastNObservations=24`). The adapter validates headers, parses CSV quoting, locally filters only `DATA_TYPE=SPR`, preserves the BOI monthly `TIME_PERIOD`, skips malformed observations, hashes each original row, and dynamically discovers every series code in the response. It has no hard-coded series allowlist and no individual-security data.
- Added dynamic official metadata resolution. The adapter discovers codelist references from BOI's SECDWH DSD endpoint, fetches only required values from the linked codelists, caches DSD/codelist payload hashes and results for 30 days, and refreshes when a newly observed code is missing. Unknown values are exposed as `<code> — לא זוהה במטא־דאטה`; no labels are inferred. It resolves the six dimensions: category, component name, indexation type, rating group, issuer sector, and unit.
- Added additive migration `0004_phase_1d_credit_spreads.sql`: registered the official BOI source, added metadata cache and dynamic series tables, revision-safe monthly observations with payload-hash idempotency, and a latest-observation view. Failed source updates leave stored history intact.
- Integrated source refresh into the existing scheduled Worker job, with source/ingestion status and non-sensitive scheduled-job logs. Added `/api/credit/spreads`, `/api/credit/spreads/:seriesCode`, and `/api/credit/summary`. The API returns latest/history, exact-calendar 1M/3M/12M deltas, source freshness, label-resolution coverage, and descriptive summaries. Basis-point changes are calculated only when BOI's official unit metadata says percent (`PT`) or percentage points (`PD`); monthly gaps remain unavailable rather than being interpolated.
- Added the Hebrew dashboard section `שוק האשראי הקונצרני — נתוני בנק ישראל`, official-free-source badge, series table, 6M/1Y/MAX chart selection, metadata warnings, provenance, freshness, and deterministic Hebrew change bullets. The licensed individual-bond screener remains separate and source-pending.
- Updated migration scripts to target `bond-analyzer-db`. The repository and handoff/spec files are moved under `order/` as requested.

### Verification and deployment

- Live BOI bulk response fetched successfully during implementation: 2,084 total rows, 72 valid `SPR` rows, three dynamically discovered series, 24 monthly observations per series, latest period `2026-09`. The current rows were `DWH_SRC_0299_MA` (1.3029846514, unit `PT`), `DWH_SRC_0438_MA_T` (0.5408625429, unit `PD`), and `DWH_SRC_0498_MA_T` (2.9170251184, unit `PD`). Values were read from the live response only; none are embedded or seeded.
- The live SDMX DSD resolved BOI codelists `CL_DWH_COMP_CATEGORY`, `CL_DWH_COMP_NAME`, `CL_INDEXATION_TYPE`, `CL_SEC_RANK_GROUP`, `CL_SECTOR`, and `CL_UNIT`. The `COMP_NAME` metadata resolved the three current codes to official BOI labels. The series set is discovered dynamically and may change on a later BOI response.
- `npm run typecheck` passed. `npm test` passed: 32 tests across 7 files. `npm run build` passed. `npx wrangler deploy --dry-run` passed, resolving assets, Worker, D1, and CORS bindings.
- Remote migration `0004_phase_1d_credit_spreads.sql` applied successfully to `bond-analyzer-db` (`ec858043-977d-4d5c-96a5-e5cd50e852e3`).
- Worker deployed at `https://israel-macro-rates-dashboard.karu-lior.workers.dev`, final restored schedule `30 16 * * 1-5`, version `ec51334f-6de3-4c37-9de3-56d4e4038c83`. Production `/api/health`, `/api/credit/spreads`, and `/api/credit/summary` returned HTTP 200; health reported D1 reachable and both credit routes returned the expected schema.
- Production ingestion remains unverified: the credit route still reports zero series and no successful ingestion run. The configured Cron did not run during checks, including a temporary minutely schedule; Wrangler's documented local `/__scheduled` test also failed because the local Windows `workerd` runtime crashed with access violation/stack overflow. No manual/admin endpoint was added and no live values were inserted directly into production D1. The normal weekday schedule has been restored. The first successful scheduled BOI ingest should populate D1; afterward verify the three APIs again and confirm the latest period/series count.
- Final source checks: all 32 tests, typecheck, production build, and Wrangler dry-run passed after implementation. No paid TASE feed, public TASE page scraping, seeded values, or inferred BOI labels were used. Top-level `secdwh-24.csv`, `secdwh-test.csv`, and `usdils-test.csv` were present as local working files and were not included in the implementation commit.
- Repository identity verified before remote actions: `C:\Users\Liorkale\Documents\Claude\Projects\StockAnalitics\bond dashboard`, remote `https://github.com/Comeon2022/bond-analyzer.git`, branch `main`. RAGOps was not accessed or modified.
- Implementation commit: `5e4cda8cb000a3f7613f54b7056ba5e8b4dcf390` (`Implement BOI free credit spread ingestion`); this commit was pushed to `origin/main`.
