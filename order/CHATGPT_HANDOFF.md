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

## Phase 1E secure manual ingestion — 2026-10-02

### Implementation

- Added operator-only `POST /api/admin/ingest`, which calls the same `runProductionIngestion` function used by the scheduled Worker. This covers the existing full source refresh, credit import, benchmark refresh, and derived snapshots; no duplicate ingestion path or frontend control was added.
- Authentication uses only the Worker binding `ADMIN_INGEST_TOKEN` and `Authorization: Bearer <token>`. Missing/malformed authorization returns 401, an incorrect configured token returns 403, and a missing Worker secret returns 503 before ingestion begins. Other methods return 405 with `Allow: POST`; query-string tokens are ignored. The route bypasses public CORS handling, so existing public API CORS behavior is unchanged.
- Added an isolate-level concurrent manual-run guard (409), sanitized per-source result reporting, and failure responses that omit raw exceptions, SQL, environment values, and credentials. Credit result fields report bulk rows fetched, SPR rows, discovered series, and latest period from runtime D1 ingestion-run details.
- Added endpoint tests covering methods, auth, query token rejection, absent secret, successful callback invocation, sanitized failure/logging, concurrency, and CORS isolation. Documented the interactive Cloudflare secret setup and PowerShell trigger/verification commands in `README.md`; no secret value is documented or committed.

### Verification and deployment

- Cloudflare `wrangler secret list` returned no configured secrets, so `ADMIN_INGEST_TOKEN` was not configured. No authenticated request or live ingestion was attempted. The deployed endpoint returns 503 for a well-formed bearer request until the secret is set.
- `npm run typecheck`: passed. `npm test`: passed (41 tests across 8 files). `npm run build`: passed. `npx wrangler deploy --dry-run`: passed; Wrangler resolved the configured `bond-analyzer-db` D1 binding and Worker assets.
- Worker deployed successfully to `https://israel-macro-rates-dashboard.karu-lior.workers.dev`; version `a8ecbb59-9ab9-4b60-bb9b-e03d981a0b82`, schedule unchanged (`30 16 * * 1-5`).
- Post-deploy checks: `/api/health` returned HTTP 200 with D1 reachable; `/api/credit/spreads` and `/api/credit/summary` returned HTTP 200 and the expected empty/pending state (0 persisted series, no latest observation period). An unauthenticated `GET /api/admin/ingest` returned HTTP 405 with `Allow: POST`.
- Manual production ingestion: not run. Production series count and latest observation period remain as previously reported under Phase 1D (no persisted production BOI rows verified yet).
- Required operator action: run `npx wrangler secret put ADMIN_INGEST_TOKEN`, then use the PowerShell invocation in `README.md`; verify `/api/health`, `/api/credit/spreads`, and `/api/credit/summary` afterward.
- Implementation commit `d873139` (`Add secure manual ingestion endpoint`) was pushed to `origin/main`. The deployment/handoff follow-up commit is pending.

## Phase 1F deterministic outlook and conclusions card — 2026-10-02

### Implemented

- Added `shared/outlook.ts`, a deterministic interpretation layer driven by the weighted regime status/coverage and the rate, CPI, inflation-expectations, long-real-yield, long-yield-momentum, and Israel-risk signal statuses. It produces a current-state sentence, a conditional base case, three data-dependent conclusions, three risk triggers, and one of the requested confidence labels. No model-generated text or investment recommendation language is used.
- The outlook distinguishes positive-moderate, mixed, cautious, and insufficient-data states. Confidence is reduced for low coverage or conflicting long-end signals. Optional aggregate credit context can add one conclusion when supplied; the overview currently does not supply that separate credit API payload, so it is omitted in the dashboard.
- Reworked the existing top regime card in `src/App.tsx` into an RTL executive summary with current state, larger base-case text, conclusions, and “what can change the picture.” Its right metrics rail retains the previous weighted regime label, green/yellow/red counts, coverage percentage/meter, and adds the outlook confidence label.
- Added responsive card styling in `src/styles.css` and scenario/language tests in `shared/outlook.test.ts` for positive, mixed, negative, low-coverage, confidence, optional credit, deterministic Hebrew snapshot, and forbidden wording cases.

### Verification and deployment

- `npm run typecheck`: passed.
- `npm test`: passed (48 tests across 9 files).
- `npm run build`: passed.
- `npx wrangler deploy --dry-run`: passed.
- This phase changes only shared interpretation code and the frontend; no Worker/API deployment is required. No GitHub Actions deployment workflow or direct Pages deployment command is present in the repository. The changes are being published to the dashboard's verified `main` branch; Cloudflare Pages production rollout was not independently verified here.
- Repository verified as `bond-analyzer`, remote `https://github.com/Comeon2022/bond-analyzer.git`, branch `main`. RAGOps was not accessed or modified.

## Phase 1G credit conditions in the deterministic outlook — 2026-10-03

### Architecture and implementation

- Chose frontend loading architecture A. `src/App.tsx` starts `/api/credit/summary` through the shared dashboard loader independently from the macro overview and health requests. Macro rendering does not await the credit request; a credit failure is converted to `null` without forwarding its network error into the executive summary.
- The summary is reused by `src/CreditPanel.tsx`, removing its duplicate `/api/credit/summary` request. Detailed spread series, history, and chart remain in the separate credit section.
- Added complete runtime shape validation for summary fields in `src/lib/api.ts`. `src/lib/credit-outlook.ts` normalizes the response into availability, freshness, latest common period, series count, and aggregate 3M widening/narrowing values; the deterministic engine does not consume the raw API response or issuer names.
- Extended `shared/outlook.ts` to emit at most one aggregate credit conclusion and at most one credit-related trigger. Fresh conditions are classified with named defaults: mild 3M widening `+10 bp`, material widening `+25 bp`, material narrowing `-25 bp`. Stale/unavailable data is shown as `לא זמין`, adds no evidence or trigger, and does not change confidence. Fresh material widening reduces confidence by one level only when the macro regime is supportive; stable/narrowing data leaves the macro confidence unchanged.
- Added the compact dynamic `אשראי קונצרני` line and period/series context to the top card. No production spread values or series identities are hard-coded. The card uses aggregate market data only and contains no recommendation language.
- Files changed: `src/App.tsx`, `src/CreditPanel.tsx`, `src/lib/api.ts`, new `src/lib/dashboard-loader.ts`, new `src/lib/credit-outlook.ts`, their tests, `shared/outlook.ts`, `shared/outlook.test.ts`, and this handoff.

### Verification and deployment

- `npm run typecheck`: passed.
- `npm test`: passed (57 tests across 11 files), including credit classifications, stale/unavailable handling, confidence adjustment, independent load failure behavior, API validation, and one-credit-item caps.
- `npm run build`: passed.
- `npx wrangler deploy --dry-run`: passed; this is frontend/shared logic only, so no Worker deployment was required.
- Live production `GET /api/credit/summary` returned 3 series, latest common period `2026-09`, status `healthy`, `stale: false`. Runtime values are consumed from the API; none are stored in code.
- Pages production rollout verified after push: `https://bond-analyzer-av2.pages.dev/` returned HTTP 200 and served the updated JavaScript bundle containing the `/api/credit/summary` consumer and normalized credit-context logic.
- Production integration check: Worker `/api/credit/summary` returned HTTP 200 with CORS allowing `https://bond-analyzer-av2.pages.dev`; the live response reports 3 series, common period `2026-09`, `healthy`, and not stale.
- Implementation commit SHA: `057b5dd23d8bbefd16d1062b8499479ddecc4dcd` (`Integrate BOI credit into macro outlook`), pushed to `origin/main`.
- Repository verified as `bond-analyzer`, remote `https://github.com/Comeon2022/bond-analyzer.git`, branch `main`. RAGOps was not accessed or modified.


## Phase 1H clarity, accessibility, and plain-language explainers — 2026-10-03

### Implemented

- Reorganized the executive hero into distinct `איפה אנחנו היום` and `מבט קדימה` blocks, with separate orientation chips, a concise current-state line, supporting/pressuring bullets, a conditional base-case paragraph, and three deterministic conditions describing persistence, improvement, and deterioration. Existing green/yellow/red regime counts, weighted status, coverage, confidence, and independent credit status remain visible.
- Surfaced annual inflation in the hero from the existing CPI signal and its freshness/status. The snapshot labels the reading supportive, neutral/mixed, or pressuring from the deterministic signal classification, uses the signal explanation, and explicitly says when there is no current verified annual reading. The full official CPI card now follows the core metric cards, is visually emphasized, has a larger value, explains annual inflation versus the index, and distinguishes missing data from zero.
- Added `src/lib/concepts.ts` and reusable native `<details>/<summary>` disclosure `src/components/ConceptExplainer.tsx`. It provides RTL, keyboard operation, a 44px target, visible focus styling, and plain Hebrew answers to “מה זה?”, “למה זה חשוב?”, and “איך לקרוא את זה?” with optional detail. Explanations cover policy rate, CPI/inflation, expectations, real/nominal yields, 10-year real yield, long-yield trend, Israel risk proxy, aggregate corporate credit spreads, Tel Bond Shekeli, spread, basis points, yield curve, coverage, confidence, duration, and YTM. Tel Bond explanatory copy explicitly avoids implying that the dashboard contains Tel Bond data.
- Added help alongside macro cards, inflation, expectations, yield curves, risk proxy, credit panel/table, confidence and coverage, and bond screener/drawer concepts. The proxy is described as a local financial-risk aid, not a CDS quote. Help appears through keyboard-operable disclosure controls and does not depend on hover.
- Macro and bond drawers now start with `בשורה אחת` and plain-language context before placing classification rules, numeric computation inputs, market detail, and provenance inside the expandable `הנתון מאחורי הקלעים` section. Drawer dimensions, line-height, and technical text sizes were increased while retaining scroll behavior and the existing source/freshness details.
- Increased typography and spacing for the hero, cards, cards’ source labels, inflation, charts/captions, source/provenance blocks, tables, and drawers. The layout stacks on narrow screens; disclosure panels remain scrollable and focusable.
- Added `src/components/ConceptExplainer.test.tsx` tests for native accessible markup, all required concepts, current/forward/inflation summary labels, and the macro drawer’s simple-first/collapsed-technical order. Vitest now includes `.test.tsx` files.
- No LLM output, fabricated market observations, or recommendation language was added; outlook remains deterministic and still distinguishes missing/unavailable source data.

### Verification and rollout

- `npm run typecheck`: passed.
- `npm test`: passed (61 tests across 12 files).
- `npm run build`: passed.
- `npx wrangler deploy --dry-run`: passed. This phase changes only frontend/presentation and has no Worker/API changes; no Worker deployment is required.
- Cloudflare Pages production deployment `bba2b3b7-81f9-4881-9cbb-9d9a3fad2535` published source commit `11f6f05` on `main` for project `bond-analyzer` / `bond-analyzer-av2.pages.dev`. Both the production alias and deployment-specific URL returned HTTP 200; the JavaScript and stylesheet returned HTTP 200. The delivered JavaScript decodes as UTF-8 and contains the new “איפה אנחנו היום”, “מבט קדימה”, inflation snapshot, explainer, and drawer labels; deployed CSS contains the responsive RTL hero rules and explainer styling. No live market observations were added or used for UI copy.
- Repository target verified as `bond-analyzer`, `origin https://github.com/Comeon2022/bond-analyzer.git`, branch `main`. RAGOps was not accessed or modified.
- Implementation commit: `fde17c8018fdf51e8ae4807dcb8fa832c57cbdd2` (`Improve dashboard clarity and explainers`), pushed to `origin/main`; final RTL grid adjustment `11f6f05daf29eba1eabb8fa569652413f1736e3f` (`Preserve RTL in briefing grid`) is also pushed and deployed to Pages production.

## Phase 1I hero clarity and explainer overflow fix — 2026-10-03

### Implemented

- Replaced the two hero list labels with `מה עוזר כרגע לאג״ח` and `מה עדיין לוחץ על השוק`. Added `src/lib/hero-evidence.ts` to express verified current CPI, policy-rate, long-yield, local-risk-proxy, and aggregate-credit signal states as concrete Hebrew sentences that connect the topic and direction to a possible bond-market effect. Unknown signals are omitted, each list is capped at three items, and explicit empty-state copy avoids claiming that missing evidence is support. Macro outlook, regime scoring, counts, coverage, and credit rail logic are unchanged.
- Reorganized the metric card hierarchy so its plain-language interpretation appears before the sparkline and emphasized the interpretation with a distinct background, border, spacing, and typography. Refined hero list spacing/dividers, mobile stacking, and secondary rail styling.
- Replaced the inline `<details>` explainer panel with a reusable `document.body` portal containing a native `<dialog>` opened with `showModal()`. This uses the browser top layer, outside the card/grid clipping and stacking contexts. Native dialog behavior supplies modal focus handling and focus restoration; the close control is focused on open, Escape uses `cancel`, backdrop clicks close, and the trigger exposes `aria-haspopup`, `aria-expanded`, `aria-controls`, and an accessible label. The dialog is RTL, scrollable, keyboard-operable, has visible focus styling, and becomes a bottom sheet on narrow screens.
- Added hero evidence tests for state/implication text and omitted unknown evidence, plus component tests for clear hero labels, portal separation, modal/RTL/screen-reader semantics, Escape/outside-close callbacks, and retained concept content. No LLM text, fabricated observations, or recommendation language was added.

### Verification and rollout

- `npm run typecheck`: passed.
- `npm test`: passed (64 tests across 13 files).
- `npm run build`: passed.
- `npx wrangler deploy --dry-run`: passed; Wrangler resolved the configured dashboard D1 and asset bindings. No Worker behavior or API contract changed, so no Worker deployment was needed.
- After the commit push, the Git-triggered Pages deployment reported source `3d3ed6c` but the production alias initially still served the previous frontend bundle. Published the verified local `dist/` build directly to Pages project `bond-analyzer` on branch `main`; deployment `9b2a865d-7990-488f-810d-b929e873d506` is available at `https://9b2a865d.bond-analyzer-av2.pages.dev`. The production alias `https://bond-analyzer-av2.pages.dev/` returned HTTP 200 and served entry assets `index-DmJ_RzG9.js` and `index-B9QkiX2J.css`; UTF-8 content checks confirmed both new hero labels, native `showModal()` behavior, and `.concept-dialog::backdrop` styling.
- Repository identity verified as `bond-analyzer`, `origin https://github.com/Comeon2022/bond-analyzer.git`, branch `main`. RAGOps was not accessed or modified. User-provided specs/CSV files under `order/` and the repository root are not task changes and must remain unstaged.

## Phase 1J top status and USD/ILS clarity — 2026-10-03

### Implemented

- Renamed the USD/ILS metric to `דולר / שקל`; the global-market section now reads `דולר / שקל, תשואות ארה״ב ופער התשואות` with the subtitle `שער הדולר מול השקל לצד נתוני תשואה אמריקאיים ופער התשואות הריאליות.` The USD/ILS metric also carries the short subtitle `שער הדולר מול השקל`. Replaced the long U.S. series labels with `תשואת אג״ח ארה״ב ל־10 שנים`, `תשואה ריאלית בארה״ב ל־10 שנים`, and `פער תשואה ריאלית ישראל–ארה״ב`; the generic `שערי חליפין` title is removed.
- Added reusable explainers for `דולר / שקל`, U.S. 10-year nominal yield, U.S. 10-year real yield, and Israel–U.S. real-yield differential. The FX explainer states how many shekels buy one dollar, describes possible context for inflation/local risk/bonds without implying a fixed causal effect, and explains how to read a higher or lower rate.
- Moved the complete `מצב כולל היום` rail before both narrative sections in DOM order and made it a compact, full-width dashboard header. It contains the current regime, green/yellow/red counts, confidence, signal coverage, and corporate-credit status. The narrative follows as current state then forward view. Removed the lower-right detached placement.
- Tightened hero padding and vertical gaps; balanced current and forward sections across the available width on desktop and stacked status → today → forward on mobile. Deterministic outlook, regime methodology, and API/data behavior are unchanged.
- Added tests for USD/ILS and U.S. yield labels/explainers, no generic FX title, complete overall-status content and DOM order, and existing concept availability.

### Verification and rollout

- `npm run typecheck`: passed.
- `npm test`: passed (66 tests across 13 files), including unchanged shared deterministic outlook tests.
- `npm run build`: passed.
- `npx wrangler deploy --dry-run`: passed; this frontend-only phase requires no Worker deployment.
- Implementation commit `71bda4d6fd5bffa806adb85e6f1a5d282f348641` (`Clarify top status and USD ILS labels`) was pushed to `origin/main`. The Git-triggered Pages deployment reported source `71bda4d` but the production alias initially served the previous bundle, so the verified local build was published directly to Pages project `bond-analyzer` on `main`. Deployment `b8e1b4da-1dab-457d-8d45-fa353506fa9d` is available at `https://b8e1b4da.bond-analyzer-av2.pages.dev`. The production alias `https://bond-analyzer-av2.pages.dev/` returned HTTP 200 and served `index-CtjZL927.js` and `index-j3zxN34W.css`; UTF-8 checks confirmed the `דולר / שקל` and `מצב כולל היום` labels, the plain-language USD/ILS explanation, and the new status/narrative layout CSS.
- Repository verified as `bond-analyzer`, remote `https://github.com/Comeon2022/bond-analyzer.git`, branch `main`; RAGOps was not accessed or modified. User-provided specs/CSV files remain unstaged.

## Phase 1L alignment, plain-language cards, and inflation clarity — 2026-10-04

### Implemented

- Aligned the blue overall-status strip and the two executive-brief columns using shared stretch alignment and top-aligned support/pressure groups. The existing one-strip/two-column structure remains; no extra hero boxes were added.
- Renamed the core metrics section to exactly `מדדי הליבה` and added a concise explanatory subtitle.
- Added `src/lib/card-plain-language.ts`, a deterministic, metric- and status-specific Hebrew summary layer for all six core cards, including explicit unavailable-data copy. These sentences explain the current signal and its possible relevance to bonds in plain language. The card bands now use this layer instead of the technical source descriptions. They contain no recommendations.
- Reworked the inflation detail panel into a smaller, more compact section. It separately explains `אינפלציה שנתית` (12-month change) and `מדד המחירים לצרכן` (the index level used to calculate inflation), labels each distinctly, and gives a concise annual-data-missing explanation while still showing an available index. Reduced chart height, metric sizing, and empty-state density.
- Kept all source calculations, metric values, status classification, and deterministic outlook logic unchanged. Changes are limited to presentation and explanatory copy.
- Added tests for state-specific deterministic Hebrew card summaries, unavailable values, no recommendation language, core section title, CPI/annual-inflation distinction, missing annual-data copy, and the separate index stat.

### Verification

- `npm run typecheck`: passed.
- `npm test`: passed (68 tests across 14 files).
- `npm run build`: passed.
- `npx wrangler deploy --dry-run`: passed; Wrangler resolved the dashboard D1 and asset bindings. No Worker/API behavior changed.
- Implementation commit `e814bcc9251390989087e582661ff15bce0fd667` (`Clarify core metrics and inflation presentation`) was pushed to `origin/main`. Published the verified `dist/` to Pages project `bond-analyzer` on branch `main`; deployment `b645cfe2` is available at `https://b645cfe2.bond-analyzer-av2.pages.dev`. The production alias `https://bond-analyzer-av2.pages.dev/` returned HTTP 200 and served `index-Ol72Gazq.js` and `index-DK3Mv78G.css`. UTF-8 bundle checks confirmed `מדדי הליבה`, `אינפלציה שנתית`, `מדד המחירים לצרכן`, the missing annual-data copy, and the new plain-Hebrew card summary. The CSS asset contains the compact inflation chart rule.
- Repository verified as `bond-analyzer`, remote `https://github.com/Comeon2022/bond-analyzer.git`, branch `main`; `origin/main` matched the implementation commit at verification. Only the Phase 1L source, tests, and this handoff are task changes; the user-provided phase specifications and CSVs remain unstaged. RAGOps was not accessed or modified.

## Phase 1M USD/ILS data depth and interpretation — 2026-10-04

### Implemented

- Reused `markets.usdIls` from `/api/overview`, including the BOI rate, observation date, source status, 1/5/20/60-session percentage changes, and historical observations. The current contract already contained all required inputs; no duplicate endpoint or API change was needed.
- Rebuilt the USD/ILS presentation as a dedicated `דולר / שקל` market context panel with subtitle `שער הדולר מול השקל ומגמת השקל`, current ILS-per-USD quote, date/source freshness, direction badge (`השקל התחזק`, `השקל נחלש`, or `כמעט ללא שינוי`), and a separate trend classification badge.
- Added session rows for יום, 5, 20, and 60 ימי מסחר. Each describes USD/ILS movement in the shekel perspective (rising USD/ILS means a weaker shekel, falling means stronger), with values rendered from the live payload.
- Added `src/lib/usdils.ts` deterministic helpers. A move is material at `0.3%`; the 5/20/60-session signs classify as strengthening/weakening when at least two are available and agree, mixed when material signs conflict, unclear when all are within threshold, or insufficient with fewer than two available horizons. Stale data is source status other than `ok`, a missing date, or an observation older than seven calendar days; in that case current trend/interpretation is suppressed and the UI shows the required stale-data message.
- Added 20- and 60-observation high/low context only when each history window exists, with a cautious lower/middle/upper range description. Added chart controls for 1M/3M/6M/1Y, each offered only when its 20/60/120/240-observation history exists.
- Added deterministic, cautious plain-language interpretation about possible import-price, inflation, and local-risk channels, plus an accessible explainer covering the quote, direction, and the fact that FX alone does not determine bond-market direction.
- Added at most one USD/ILS hero bullet when a fresh 20-session move reaches the named 1% material threshold and there is room in the existing evidence limits. No macro regime or calculation logic changed.
- Updated styling for the snapshot tiles, horizon grid, trend/direction badges, range context, and historical chart. Tests cover USD-to-shekel direction, aligned/mixed/flat/insufficient trend cases, all display horizons and live values, stale suppression, insufficient history, range/chart availability, cautious wording, recommendations, and hero integration.

### Verification and rollout

- `npm run typecheck`: passed.
- `npm test`: passed (74 tests across 15 files).
- `npm run build`: passed.
- No Worker deployment was needed because the existing overview payload already supplied the required history and lookbacks.
- Implementation commit `4c07a6ae7435a38ce119a71cef80c97a1d8d1a18` (`Expand USD ILS market context`) was pushed to `origin/main`. Published the verified frontend to Pages project `bond-analyzer`; deployment preview is `https://cf833349.bond-analyzer-av2.pages.dev`.
- Production alias `https://bond-analyzer-av2.pages.dev/` returned HTTP 200 and served `index-BnHGJOPq.js` and `index-DVR4nPG6.css`; UTF-8 bundle checks confirmed the current-rate context, all-session copy, stale-data state, interpretation heading, shekel direction, and chart. The production bundle retained its configured Worker origin. Its live `/api/overview` returned HTTP 200 JSON with a current USD/ILS value and observation date, 429 historical observations, all four lookbacks, and BOI source status `ok`.
- Repository verified as `bond-analyzer`, remote `https://github.com/Comeon2022/bond-analyzer.git`, branch `main`; `origin/main` matched the implementation commit at verification. User-provided phase specs/CSVs remain unstaged. RAGOps was not accessed or modified.

## Phase 1N U.S. Treasury context — 2026-10-04

### Implemented

- Extended the existing official FRED CSV adapter to accept `DGS2` and `T10YIE`, alongside existing `DGS10` and `DFII10`. These series use the same revision-aware `macro_observations` storage path and the existing scheduled/manual ingestion pipeline. FRED series links are included in the UI for source attribution.
- Added additive migration `0005_us_treasury_context.sql` defining the two new series with source codes `DGS2` and `T10YIE` and extending the configured FRED calendar lookback to 450 days. The Worker reads this setting and retains a safe 400-day minimum; the API keeps up to 500 business observations, enough for 1Y charts and 60-session lookbacks.
- Extended `/api/overview` with `us2yNominal`, `us10yBreakeven`, and derived `us2s10s`, while keeping existing `us10yNominal` and `us10yReal`. The 2s10s history only uses dates present in both DGS10 and DGS2; its value and lookbacks are represented in basis points. All four U.S. yield series expose actual-observation-date lookbacks `1dBp`, `5dBp`, `20dBp`, and `60dBp`.
- Added the `אג״ח ממשלת ארה״ב` panel with the four requested primary metric cards, trend/status/date, 2Y/10Y/2s10s mini curve, a 1/5/20/60 basis-point explanation, selector for 10Y nominal/real/breakeven and 2Y histories, and 1M/3M/6M/1Y periods only when enough observations exist. Missing observations remain missing; no weekends, holidays, or values are interpolated.
- Added reusable deterministic interpretation in `src/lib/us-treasury-context.ts`. Yield trends need two available 5/20/60-session directions; a move is material above 5 bp, breakeven uses 3 bp, and opposing material directions classify as mixed. The curve is inverted below 0 bp, flat from 0 to under 25 bp, and rising at 25 bp or more. Current interpretation requires fresh nominal and real yields; stale individual measures do not produce a current direction. The hero can include at most one fresh U.S. 10Y bullet for a 20-session move of at least 25 bp.
- Added plain Hebrew explainers for 2Y, 10Y nominal, 10Y real, breakeven inflation and 2s10s, plus a visible explanation of possible U.S.-to-Israel bond-market links using cautious, non-causal wording. No investment recommendations or LLM-generated interpretation were introduced.
- Tests cover DGS2/T10YIE CSV parsing with gaps, aligned-date 2s10s derivation, curve shape, changes in basis points, trend and component wording, staleness, chart coverage, missing-value UI, recommendation language, and hero limits.

### Verification, deployment, and data-ingestion blocker

- `npm run typecheck`: passed.
- `npm test`: passed (84 tests across 18 files).
- `npm run build`: passed.
- `npx wrangler deploy --dry-run`: passed.
- Applied remote D1 migration `0005_us_treasury_context.sql` successfully.
- Deployed Worker `israel-macro-rates-dashboard` at `https://israel-macro-rates-dashboard.karu-lior.workers.dev`; version ID `d061418b-3648-4d0d-82c7-eadda48e1ae0`. `/api/health` and `/api/overview` returned HTTP 200; the new market fields and API contract are present.
- Published Pages project `bond-analyzer` preview `https://786ff348.bond-analyzer-av2.pages.dev`. Production alias `https://bond-analyzer-av2.pages.dev/` returned HTTP 200 and served `index-BYhg92CY.js` and `index-ZoH8e-k0.css`; bundle checks confirmed the U.S. Treasury panel and configured production Worker origin, and CSS checks confirmed the panel styles.
- Verified the official FRED CSV endpoint directly for all four series on 2026-10-04. Latest returned observations in the checked date window were: DGS2 `2026-10-01` (4.78), DGS10 `2026-10-01` (5.24), DFII10 `2026-10-01` (2.88), and T10YIE `2026-10-02` (2.36). These direct checks confirm source availability but were not written to D1.
- **Authenticated production ingestion is pending.** `ADMIN_INGEST_TOKEN` exists as a Cloudflare Worker secret, but its value is write-only and is not available in this workspace or local environment. The deployed `/api/overview` therefore currently returns null/pending for DGS2/T10YIE and null/error for DGS10/DFII10; D1 has no persisted observations for these four macro series. The last recorded DGS10/DFII10 runs failed with source HTTP 520 on 2026-10-02. Do not claim the new data has been ingested until the manual pipeline succeeds.
- To trigger the existing secure pipeline locally, enter the already configured token without adding it to command history, then share the command response (never the token):

  ```powershell
  $env:ADMIN_INGEST_TOKEN = Read-Host 'Enter the configured admin ingestion token'
  try {
    Invoke-RestMethod -Method Post -Uri 'https://israel-macro-rates-dashboard.karu-lior.workers.dev/api/admin/ingest' -Headers @{ Authorization = "Bearer $env:ADMIN_INGEST_TOKEN" }
  } finally {
    Remove-Item Env:ADMIN_INGEST_TOKEN
  }
  ```

- Implementation commit `f5cc7b6b9bf2011283a2f3f22f57b519806ff26b` (`Add U.S. Treasury context and curves`) was pushed to `origin/main`. Handoff rollout follow-up is recorded in the next documentation commit. Repository is `bond-analyzer` on `https://github.com/Comeon2022/bond-analyzer.git`; user-provided specs/CSVs remain unstaged. RAGOps was not accessed or modified.

## Phase 1K executive brief rebuild — 2026-10-03

### Implemented

- Rebuilt the hero markup in `src/App.tsx` around the required reading order: one `מצב כולל היום` status strip, then exactly two desktop columns: `איפה אנחנו היום` on the right and `מבט קדימה` on the left. The strip keeps the regime, confidence, coverage, positive/mixed/negative counts, and corporate-credit status together. The former detached side rail and duplicate “today / forward” chips are removed.
- Removed the nested inflation card and replaced it with a compact highlighted `אינפלציה:` line, its current signal state or clear missing-data text, date when available, and the accessible inflation explainer. The hero retains only the confidence, coverage, and inflation explainers.
- Kept the current-state sentence and support/pressure groups together. Support and pressure labels are now `מה עוזר כרגע` and `מה עדיין לוחץ`; evidence strings are concise, and each list remains capped at three items. The forward column contains `תרחיש בסיס` and exactly three labeled lines: `אם המצב נמשך`, `שיפור אפשרי`, and `סיכון מרכזי`.
- Replaced the previous status card/grid rules with a compact strip and equal-width two-column desktop layout. Typography establishes hierarchy without nested boxes. Mobile stacks status → today → forward and support → pressure, with no horizontal layout requirement. Only hero presentation/copy changed; the shared deterministic regime, confidence, coverage, credit classification, and outlook generation logic remain untouched.
- Added regression checks for one instance of each main title, status-to-today-to-forward DOM order, status contents, removed rail/inflation card, compact inflation line, exactly three forward labels, and evidence list maximums/concise copy.

### Verification and rollout

- `npm run typecheck`: passed.
- `npm test`: passed (66 tests across 13 files).
- `npm run build`: passed.
- `npx wrangler deploy --dry-run`: passed; no Worker/API changes require deployment.
- Implementation commit `2bff3a8ac6248bb8a4878dda9700df83345f9d56` (`Rebuild hero as compact executive brief`) was pushed to `origin/main`. The Git-triggered Pages deployment reported source `2bff3a8` but initially served the prior bundle, so the verified local `dist/` build was published directly to Pages project `bond-analyzer` on `main`. Deployment `bbfd7086-abec-4313-9d25-6cc4c48b6d56` is available at `https://bbfd7086.bond-analyzer-av2.pages.dev`. The production alias `https://bond-analyzer-av2.pages.dev/` returned HTTP 200 and served `index-DvxkuKqC.js` and `index-lBRUhuHh.css`; UTF-8 content checks confirmed the executive brief, compact support label, inflation line, and two-column/status CSS.
- Repository verified as `bond-analyzer`, remote `https://github.com/Comeon2022/bond-analyzer.git`, branch `main`; RAGOps was not accessed or modified. User-provided specs/CSV files remain unstaged.


## Phase 1O - Official U.S. Treasury feed cutover - 2026-10-04

### Implemented

- Replaced the production Worker U.S. Treasury fetch path from FRED with official U.S. Department of the Treasury annual CSV feeds. Nominal URL pattern: `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve`. Real URL uses `type=daily_treasury_real_yield_curve`. Ingestion fetches each calendar year in the configured minimum 400-day / default 450-day window, filters to the exact start date, merges by date, and preserves gaps.
- Added additive migration `0006_us_treasury_official_feeds.sql` defining separate `ust_2y_nominal`, `ust_10y_nominal`, and `ust_10y_real` identities under official `us_treasury` source. FRED series and observations remain unchanged.
- Added nominal and real Treasury CSV parsers. They normalize headers and Treasury `MM/DD/YYYY` dates, validate calendar dates and numeric yields, skip blank/N/A/ND/dot/malformed observations, sort ascending, and never fill missing observations.
- Preserved `/api/overview` keys `us2yNominal`, `us10yNominal`, `us10yReal`, `us10yBreakeven`, and `us2s10s`. Source yields carry Treasury source, actual observation date, and `derived: false`; calculated metrics carry `derived: true` and formula provenance. Breakeven is 10Y nominal minus 10Y real; 2s10s is 10Y nominal minus 2Y nominal. Both require date alignment. Breakeven freshness depends on both sources.
- Replaced FRED-only UI source labels with the official U.S. Treasury source; displayed formulas for calculated values. Existing Phase 1N metrics, changes, charts, trends, and Israel context remain intact.
- FRED parser/history remain available, but production Worker ingestion no longer calls FRED. Manual-ingestion output marks `fredCrossCheck` as `not_run`; its status cannot affect panel availability.
- Added parser tests for nominal 2Y/10Y, real 10Y, N/A and invalid dates, gaps, and aligned-date breakeven calculation.

### Verification and rollout

- Verified official Treasury 2026 nominal and real CSVs return HTTP 200 and observations through `2026-10-02`: 2Y nominal 4.83%, 10Y nominal 5.28%, and 10Y real 2.92%. Verified 2025 annual files return HTTP 200 with year history for the 450-day fetch window.
- `npm test`: passed, 86 tests / 18 files. `npm run typecheck`: passed. `npm run build`: passed. `npx wrangler deploy --dry-run`: passed.
- Applied remote D1 migration `0006_us_treasury_official_feeds.sql` successfully.
- Deployed Worker `israel-macro-rates-dashboard` at `https://israel-macro-rates-dashboard.karu-lior.workers.dev`; version `756c93ae-98a7-49ee-aff7-ca3d893a3a1c`. `/api/health`: `ok: true`, database reachable. `/api/overview` returns the five expected fields with source and derived provenance.
- Published frontend to Pages project `bond-analyzer`: `https://652d850e.bond-analyzer-av2.pages.dev`. Both that deployment and `https://bond-analyzer-av2.pages.dev/` returned HTTP 200. The frontend bundle contains the Treasury source label and production Worker API origin.
- **Authenticated live ingestion and value verification are pending.** `ADMIN_INGEST_TOKEN` exists as a Cloudflare secret but is write-only and unavailable in this workspace. No secret was read, exposed, or changed. Immediately after deployment, all five overview values are correctly pending/null because no Treasury rows have been written. Do not claim live D1 verification yet. The manual response reports `usTreasuryNominal`, `usTreasuryReal`, `fredCrossCheck`, counts, and latest dates. Check the five populated values and chart/lookback dates after ingestion.
- Secure manual ingestion command (enter the token only at the hidden prompt; share only JSON output, never the token):

  ```powershell
  $env:ADMIN_INGEST_TOKEN = Read-Host 'Enter the configured admin ingestion token'
  try {
    Invoke-RestMethod -Method Post -Uri 'https://israel-macro-rates-dashboard.karu-lior.workers.dev/api/admin/ingest' -Headers @{ Authorization = "Bearer $env:ADMIN_INGEST_TOKEN" } | ConvertTo-Json -Depth 6
  } finally {
    Remove-Item Env:ADMIN_INGEST_TOKEN
  }
  ```

- Repository verified before rollout: `bond-analyzer`, branch `main`, origin `https://github.com/Comeon2022/bond-analyzer.git`. RAGOps was not accessed. User-provided specs/CSV fixtures remain unstaged.
- Implementation commit SHA: 0a53102e3b8bec01a2329530bd5622d314dcdfdf (Use official Treasury yield feeds).

## Phase 1P - Remove active FRED provenance - 2026-10-04

### Repository audit and implementation

- Audited the repository for `FRED`, `fred`, `DGS10`, `DFII10`, `DGS2`, and `T10YIE`. Active user-facing/API provenance was found in the real-yield differential, risk-proxy summary/card, and two active U.S.-yield fixtures; the README also described FRED as the current source. These paths now identify U.S. Treasury.
- `/api/overview.markets.realYieldDifferential` now reports `source: Bank of Israel + U.S. Treasury`, `derived: true`, a formula provenance string, and both BOI and official Treasury real-feed URLs. Its freshness uses BOI real-curve and U.S. Treasury real-feed statuses. Its numeric value and change calculations are unchanged.
- The risk proxy and its components now include source, source URLs, and provenance. The U.S. real-yield differential component identifies BOI + U.S. Treasury; USD/ILS and Israeli real-yield components identify BOI. The explanation still describes the proxy as a combination of observed indicators and explicitly says it is not CDS. The risk card and detail drawer show the combined sources.
- Active U.S. nominal/real signal explanations are explicitly set to U.S. Treasury at runtime, independent of previously seeded definition descriptions. The Treasury panel keeps U.S. Treasury source labels and locally derived formulas for breakeven and 2s10s. Updated README active-source wording.
- Added migration `0007_treasury_provenance_cleanup.sql` to deactivate the historical FRED source and series while preserving observations, and to replace the seeded active signal descriptions/settings text. Existing `0002`/`0005` migration files were not rewritten because they record historical setup.
- Remaining FRED references are intentional: `worker/sources.ts` parser and series IDs for optional legacy cross-check development; parser fixtures/tests; `worker/index.ts` legacy `fred_` run attribution and `fredCrossCheck: not_run`; historical migrations and handoff notes; and this audit/handoff. None supplies active U.S. market values, source status, or risk freshness. No active U.S. Treasury UI bundle includes the FRED label.
- Added tests for source labels and URLs on the differential and proxy components, unchanged differential value/change, stale-source propagation, absence of FRED in active Treasury UI/provenance payloads, and the locally derived formulas.

### Verification and deployments

- `npm run typecheck`: passed.
- `npm test`: passed, 87 tests across 19 files.
- `npm run build`: passed with production `VITE_API_BASE_URL`.
- `npx wrangler deploy --dry-run`: passed.
- Deployed Worker `israel-macro-rates-dashboard`; version `9969a484-5632-4f15-9410-228cafe2f9fd`.
- Published Pages preview `https://f19da0c6.bond-analyzer-av2.pages.dev`; production alias `https://bond-analyzer-av2.pages.dev/` returned HTTP 200. Verified its JavaScript bundle contains the production Worker URL and U.S. Treasury label and has no `FRED` string.
- Verified live `/api/health` is healthy. Live `/api/overview` reports U.S. Treasury for all five U.S. yield fields; breakeven and 2s10s include formula provenance; `realYieldDifferential` reports BOI + U.S. Treasury and both source URLs; risk-proxy metadata identifies BOI and U.S. Treasury components and states it is not CDS. The active provenance subset contained no FRED label.

### Remote D1 migration and Git

- Remote D1 migration `0007_treasury_provenance_cleanup.sql` could not be applied from this session. `npx wrangler d1 migrations apply bond-analyzer-db --remote` failed with Cloudflare API error 7403: The given account is not valid or is not authorized to access this service. Worker and Pages deployments succeeded. Active Worker/API provenance is corrected independently, but the stored legacy FRED source/series enabled flags and seeded signal descriptions will remain until the migration is applied.
- After authenticating Wrangler with a Cloudflare account/token that has D1 access, run: `npx wrangler d1 migrations apply bond-analyzer-db --remote`.
- Repository verified as `bond-analyzer`, branch `main`, origin `https://github.com/Comeon2022/bond-analyzer.git`; RAGOps was not accessed. User-provided phase specs and CSVs remain unstaged.
- Implementation commit SHA: 1f8ce07c0fc850b9e7de6fc071b8eda594efe730 (Remove active FRED provenance).

## Phase 1Q - Source Status UX and Hero Polish (2026-10-04)

- Replaced public raw ingestion error text with a safe `failureKind` category (`unavailable`, `timeout`, or `malformed`); the public `lastError` field is always null. Technical exception details remain in internal ingestion records/logs.
- Added the latest check timestamp (`checkedAt`) separately from the market observation date. UI labels these independently as observation and check time.
- Source rows now distinguish source health from data availability, with Hebrew status badges and deterministic Hebrew notes. Failed refreshes continue to show the latest persisted observation when present; no observation is presented as unavailable without exposing an upstream response or code. CPI follows the same behavior.
- Tightened source rows and improved alignment/spacing for the hero status strip, equal-width current/forward columns, divider, and reduced vertical blue space; mobile layout continues to stack status, current, then forward.
- No numeric, signal, or regime calculations were changed.
- Added presentation tests covering friendly error states, no raw upstream errors, retained prior observations, timeout/malformed wording, and distinct observation/check timestamps.
- Verification: `npm run typecheck`, `npm test` (20 files, 91 tests), `npm run build`, and `npx wrangler deploy --dry-run` all passed.
- Deployment: Worker plus bundled Pages assets deployed at `https://israel-macro-rates-dashboard.karu-lior.workers.dev`, version `1de16451-37a3-4ff2-ae35-9ffc2b38f447`. Production `/api/overview` and `/api/sources/status` returned successfully for all 8 sources; the public response contained no raw errors, exposed check timestamps, and reported the current CBS CPI source failure as unavailable with no observation.
- Git: implementation commit `3d4fe21d60fa20258c12473db9eec85cb1a293dd` (Polish source status and executive hero); target repository verified as the bond dashboard (`israel-macro-rates-dashboard`) with origin `https://github.com/Comeon2022/bond-analyzer.git`, branch `main`. The handoff record is updated in a follow-up commit.

## Phase 1R - Hero Alignment and CBS CPI Recovery (2026-10-04)

- Production root cause found: the latest `cbs_cpi` ingestion run failed with HTTP 522 and 0 rows; production D1 currently has no CPI observation/history. The existing CBS fetch sent Accept but omitted the CBS-required User-Agent. From this environment, both official CBS `price` JSON and XML endpoints returned HTTP 200 when called with the required stable User-Agent.
- CBS requests now send `User-Agent: bond-analyzer/1.0 (Israel macro dashboard)`, `Accept: application/json, application/xml;q=0.9`, and a 25-second abort timeout. JSON (`format=json`) is primary; a failed transport, malformed payload, or invalid series falls back to the same official CPI `price` endpoint as XML (`format=xml`). XML parser accepts only verified headline CPI series code 120010 and extracts actual year/month/index values; no unofficial mirror or price-selected mapping is used.
- The request asks for 240 monthly observations and uses `PageSize=300` because the CBS default page size otherwise returns only the first 100. Live official JSON and XML parsing each returned the same 240 actual monthly observations through 2026-08; latest index is 105.8, August 2025 index is 104.2, August 2026 month-over-month index 105.1. Direct-source calculations are 1.5355% YoY and 0.6660% MoM. These values are source-validation results; they have not yet been inserted into production D1.
- JSON/XML observations normalize to the same stable series/date/value hash, suppress duplicate months, and retain the existing per-date revision insert behavior. Existing stored observations are never deleted on a failed refresh. YoY/MoM continue to use exact monthly observations only; missing months are not interpolated. CPI card provenance names CBS/הלמ״ס.
- The secure manual-ingestion response adds sanitized `cbsCpi` fields (`formatUsed`, `rowsRead`, `rowsWritten`, `latestDate`, `failureKind`); public ingestion status now sanitizes internal upstream error strings.
- Hero now uses a five-item status grid, an explicit state group, equal-width desktop briefing columns with aligned headings and centered divider, and aligned equal support/pressure subcolumns. Mobile stacks status before today and forward, with readable grouped status details. Production Pages screenshots at 1440px and 390px were visually checked after deployment.
- Verification: `npm run typecheck`, `npm test` (21 files, 100 tests), `npm run build` with production `VITE_API_BASE_URL`, and `npx wrangler deploy --dry-run` all passed. Added CBS JSON, XML, mandatory header, fallback, dual-failure sanitization, exact CPI calculation/no-interpolation, API sanitization, and hero-order tests.
- Worker deployed as version `d4682035-0d35-47cc-b77b-a3b7cdc3e99f`. Pages project `bond-analyzer` deployed to preview `https://cb31a1f1.bond-analyzer-av2.pages.dev`; after push, the Git-connected Production deployment for commit `69b5948` became active at `https://ee85b354.bond-analyzer-av2.pages.dev`. Preview and production alias HTML/CSS returned HTTP 200; 1440px desktop and 390px mobile screenshots were visually reviewed.
- Production post-deploy `/api/overview`, `/api/sources/status`, and `/api/ingestion/status` returned HTTP 200. CPI is still empty (0 observations, no annual inflation) because manual ingestion could not be authenticated from this runner. Wrangler confirms the remote `ADMIN_INGEST_TOKEN` secret exists, but secret values cannot be retrieved and no local token is configured. The prior D1 CPI state was confirmed empty; no values were seeded. Manual production ingestion and populated-CPI visual verification remain outstanding until the authorized token is supplied through the operator's secure local prompt.
- Git target verified as bond dashboard repository `https://github.com/Comeon2022/bond-analyzer.git`, branch `main`; RAGOps was not accessed.
- Implementation commit SHA: `1a3f621129ebd8856b0d6e2864d44714a7552344` (`Restore official CBS CPI ingestion and align hero`); the final handoff-only update follows in the next commit.

## Phase 1S - Exact Hero Rebuild and CPI Activation Gate (2026-10-04)

### Hero rebuild

- Replaced the previous hero component structure with a new semantic layout: one six-cell status strip, a two-column main grid with exactly one today section and one forward section, and a shared two-column support/pressure grid. The deterministic regime, confidence, coverage, credit, inflation, evidence, and outlook values are unchanged.
- The desktop status strip uses the specified six grid tracks (`220/120/110/110/160/120px` minimums with the required fractional weights), centered cell content, inline help icons, and cell separators. Desktop narrative columns use equal `repeat(2, minmax(0, 1fr))` tracks, identical `0 24px` padding, top alignment, a single center divider, and a 20px gap below the strip. The support/pressure pair is also an equal, top-aligned grid. Hero padding is 24px top/sides and 18px bottom; headings use a 12px bottom margin. There are no absolute-positioned hero elements or nested cards.
- Added semantic hero tests for a single status strip, exactly two content sections, unique headings, ordered status cells and outlook statements, and a shared evidence grid.
- Built with `VITE_API_BASE_URL=https://israel-macro-rates-dashboard.karu-lior.workers.dev`. The first manual Pages upload lacked this build-time variable and showed a localhost API fallback; it was immediately superseded by a corrected production upload. The production-domain screenshot below confirms the corrected build connects to the live Worker.

### Verification and deployment

- `npm run typecheck`: passed.
- `npm test`: passed, 21 files and 100 tests.
- `npm run build`: passed using the production Worker API URL.
- `npx wrangler deploy --dry-run`: passed.
- An initial direct Pages upload was `https://265a93c4.bond-analyzer-av2.pages.dev`; after pushing commit `f0701e9`, Git-connected Pages production deployment `eef45765-82d6-4dd1-807a-78d03cd0c838` became active at `https://eef45765.bond-analyzer-av2.pages.dev`, with the production alias `https://bond-analyzer-av2.pages.dev/`. The Git-connected production screenshot confirmed live Worker data and no API connection error.
- Captured and visually inspected a 1440x1200 screenshot of the Git-connected production deployment at `C:\Users\Liorkale\Documents\Claude\Projects\StockAnalitics\bond-dashboard-phase1s-git-production-1440.png`. It shows the six aligned status items, equal today/forward columns with aligned headings and centered divider, aligned support/pressure headings, and no excess lower blue space. The screenshot is stored outside the repository.
- Worker ingestion code did not change in Phase 1S, so the existing Worker deployment remains version `d4682035-0d35-47cc-b77b-a3b7cdc3e99f`; `/api/health` returns `ok: true`, with D1 reachable.

### CPI production status — still requires operator authentication

- Production checks after the corrected Pages deployment: `/api/overview` returned CPI observation count `0`, latest CPI index `null`, and annual inflation `null`; `/api/sources/status` reports CBS CPI source status `error`, failure kind `unavailable`, and no observation. No CPI data was seeded or fabricated.
- The authenticated manual ingestion has not been run. `ADMIN_INGEST_TOKEN` is configured remotely, but its secret value is unavailable in this coding session. Consequently Phase 1S is **not complete** and no production CPI recovery is claimed. The screen correctly distinguishes CPI-unavailable state while continuing to display live macro data.
- Operator action required: run the following in PowerShell on a machine/session where the configured ingestion token is available. Enter the secret only at the prompt, do not send or commit it, and share the sanitized JSON response so production CPI can be verified afterward.

  ```powershell
  $env:ADMIN_INGEST_TOKEN = Read-Host 'Enter admin ingestion token'

  try {
    $resp = Invoke-RestMethod `
      -Method Post `
      -Uri 'https://israel-macro-rates-dashboard.karu-lior.workers.dev/api/admin/ingest' `
      -Headers @{ Authorization = "Bearer $env:ADMIN_INGEST_TOKEN" }

    $resp | ConvertTo-Json -Depth 10
  }
  finally {
    Remove-Item Env:ADMIN_INGEST_TOKEN
  }
  ```

- Completion remains gated on response fields `cbsCpi.ok = true`, `rowsRead > 0`, and a non-null `latestDate`, followed by `/api/overview` returning CPI history, a latest CPI value, and annual inflation, and a live UI check of the CPI card/detail and hero inflation line.
- Repository verified as the bond dashboard on `main` with origin `https://github.com/Comeon2022/bond-analyzer.git`; RAGOps was not accessed. Phase specs and CSV fixtures remain unstaged.
- Hero implementation commit: `68bf0baa9e9c931cb75a9c31c1aafae240ee4599` (`Rebuild executive hero to Phase 1S template`). This handoff update is committed separately.
