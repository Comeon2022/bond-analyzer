# Israel Macro/Rates Dashboard

Local Phase 1A dashboard for Bank of Israel rates and government yield curves, plus CBS CPI. It runs as a React/Vite client and a Cloudflare Worker backed by D1.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`; the local API base defaults to `http://localhost:8787`.
3. Apply the local schema with `npm run db:migrate:local`.
4. Start the Worker with `npm run worker:dev` and the UI with `npm run dev` in another terminal.
5. For a production bundle, run `npm run build`; check types with `npm run typecheck`; run unit tests with `npm test`.

## GitHub and Cloudflare frontend/backend connection

- Dashboard repository: `https://github.com/Comeon2022/bond-analyzer.git`; production branch: `main`.
- Cloudflare Pages settings: project `bond-analyzer`, production branch `main`, framework React (Vite), build command `npm run build`, output directory `dist`. `package.json` is at the repository root, so the Pages root directory is blank.
- The React app uses the shared typed client in `src/lib/api.ts`. Set the public build-time variable `VITE_API_BASE_URL` to the Worker origin, such as `https://<worker-name>.<account-subdomain>.workers.dev`. It defaults to same-origin when unset. Vite embeds this public URL into the frontend bundle; updating it requires a Pages rebuild.
- For local development, `.env.example` can be copied to ignored `.env.local` and points at `http://localhost:8787`. `.env`, `.env.local`, and `.env.*.local` are ignored. Never put D1 IDs, API tokens, or private source credentials in `VITE_*` variables.
- The static frontend calls the Worker over HTTP and never accesses D1. The Worker retains the D1 binding. Configure `ALLOWED_ORIGINS` as a comma-separated exact origin list in Worker settings; the checked-in local defaults include `http://localhost:5173` and `https://bond-analyzer-av2.pages.dev`. Unknown browser origins are rejected; origin values are never reflected without allowlist validation.
- `/api/health` returns service name, timestamp, and database reachable/unavailable status only. The frontend checks it on initial load and displays connected/unavailable state; failed overview/detail requests show error states and do not turn missing data into zeroes.
- Suggested deployment order: publish the verified `main` branch; create/identify D1 and set its real ID in `wrangler.toml`; apply remote migrations; configure Worker `ALLOWED_ORIGINS` and any secrets; deploy the Worker and verify `/api/health` and `/api/macro/overview`; configure Pages `VITE_API_BASE_URL` to the Worker URL and deploy Pages. Worker and Pages production deployment remain manual.
- D1 remote migration command: `npm run db:migrate:remote`. Confirm the database name and ID before running it. Do not place the D1 binding or identifiers in the browser.

The scheduled worker refreshes official sources on weekdays at 16:30 UTC. No macro observations are seeded. The first successful scheduled run imports the official source data. Local D1 and production deployment require a real D1 database; replace the placeholder `database_id` in `wrangler.toml` before remote migration or deployment. Never put Cloudflare credentials in tracked files.

## Operator manual ingestion

`POST /api/admin/ingest` runs the same complete production ingestion pipeline as the scheduled Worker (official macro and credit sources, benchmark refresh, and signal snapshots). It is intended for CLI/PowerShell operators; no frontend control or browser CORS access is provided. The endpoint requires the Cloudflare Worker secret `ADMIN_INGEST_TOKEN` in an `Authorization: Bearer ...` header. It returns sanitized source run statuses and counts; individual source failures are reported without exposing raw errors. Concurrent manual requests receive HTTP 409.

Configure the secret interactively; never put its value in source, documentation, shell history, or a command argument:

```powershell
npx wrangler secret put ADMIN_INGEST_TOKEN
```

Then trigger and verify the production run:

```powershell
$token = Read-Host "Admin ingest token"
Invoke-RestMethod `
  -Method POST `
  -Uri "https://israel-macro-rates-dashboard.karu-lior.workers.dev/api/admin/ingest" `
  -Headers @{ Authorization = "Bearer $token" }
Remove-Variable token
Invoke-RestMethod -Uri "https://israel-macro-rates-dashboard.karu-lior.workers.dev/api/health"
Invoke-RestMethod -Uri "https://israel-macro-rates-dashboard.karu-lior.workers.dev/api/credit/spreads"
Invoke-RestMethod -Uri "https://israel-macro-rates-dashboard.karu-lior.workers.dev/api/credit/summary"
```

## Phase 1B data and calculations

- BOI policy rate (`GetInterest`), CBS CPI (`id=120010`), BOI nominal and real curves (`shcd08_e.xls`, `shcd07_e.xls`) continue on their official publication cadence.
- BOI inflation expectations workbook (`shcf10_e.xls`): `IL_BEI_1Y` column C, `IL_BEI_5Y` column G, `IL_BEI_5Y5Y` column H, and `IL_FORECAST_CPI_12M` column I. Checked daily; actual workbook publication/observation period is retained, with a 1,440-hour stale window.
- BOI USD/ILS uses `GetExchangeRate?key=USD` for current fixing and SDMX series `RER_USD_ILS` for historical business-day observations. Changes use available 1/5/20/60 observations; gaps are not filled. It is an indicative official fixing.
- FRED daily `DGS10` and `DFII10` are fetched as CSV over a 120-calendar-day window, sufficient for 60-business-session comparisons; `.` and holidays are ignored. Market staleness is 72 hours.
- A deterministic Hebrew ?what changed? summary compares available stored observations and emits at most four non-causal bullets.
- Israel risk conditions proxy averages the available directional components: USD/ILS 20-session change, Israeli 10Y real-yield comparable-period change, and IL-US real-yield differential comparable-period change. Thresholds are D1 settings (2%, 15bp, 15bp). It is not CDS. Missing components are excluded.
- Primary regime weights are policy 15%, CPI 15%, expectations 15%, Israeli real yield 20%, nominal yield trend 15%, and risk proxy 20%. Missing/stale weighted signals are excluded, valid weights renormalize, and coverage is reported. USD/ILS and U.S. yields remain context only.
- The BOI downloadable curve workbooks are calendar and CPI-dated averages published approximately twice monthly. No daily observations are interpolated. Long-yield comparison uses the nearest available source observation at least 30 calendar days earlier.
- D1 migration `0002_phase_1b.sql` adds market series, thresholds, derived observations and immutable daily regime snapshot tables.
- Worker scheduled ingestion checks all official sources daily. Local execution: `npm run db:migrate:local`, then run worker and Vite as described above.


## Phase 1C: bond screener and licensing status

The bond screener is implemented, but intentionally has no bond securities or observations seeded. Only issuer-group metadata is present: Government of Israel, Israel Ports Company, Israel Electric Corporation, Mekorot, and Israel Natural Gas Lines. This metadata does not claim that any specific series is currently active or tradable. No current quote, coupon, duration, yield, rating, or volume has been inferred.

### Source review and access blocker

- Primary candidate: TASE DATA HUB API, official guide `https://content.tase.co.il/media/l5xjhjmz/2000_api_guide_eng.pdf` and product/pricing page `https://www.tase.co.il/en/content/products_lobby/datastore_pricelist`.
- The API guide requires Developer Portal registration, application creation, product registration/approval, and an API key. It states that paid product requests do not grant access automatically and that per-product schemas and update schedules are available in the authenticated portal. The guide describes global request limits of 10 requests per two seconds.
- TASE's official 2026 product list `https://content.tase.co.il/media/4imn13pz/2001_api_pricelist_2026_eng.pdf` lists paid bond products, including Extended Bond Data (monthly internal/distribution pricing), Bond Amortization Schedule, and Securities EoD products. Prices and redistribution terms vary by product; some distribution datasets are restricted to specified indices. No entitlement or terms are configured for this dashboard.
- TASE public security pages may display security terms and market details, but they are not used as an ingestion endpoint. The dashboard does not scrape public HTML or work around authentication/licensing.
- Midroog has an issuer page with rating/series information for IEC (`https://www.midroog.co.il/ArticlePage.aspx/company/0e5623f8-b30f-4a77-b4b0-d171d48259f6/series`), but a rating page alone does not supply the licensed daily price/yield/volume history required for relative value. No rating is seeded or normalized across agencies.

Until TASE product access and use terms are confirmed, `/api/bonds/source-status` reports `pending`, all observed bond fields remain null/absent, and the screener displays an explicit blocker. The API adapter status is in `worker/bond-source.ts`; it does not request market observations without an approved product contract and credentials. Configure a licensed official adapter only after the exact product API schema, use rights, fields, and cadence are provided.

### Bond model and calculations

- Additive migration `0003_phase_1c_bonds.sql` adds issuer metadata, a bond master, revisioned market observations, daily benchmark observations, agency-specific ratings, and revisioned cash-flow schedules. Issuer rows are metadata-only; `bond_master`, market observations, ratings, and cash flows start empty.
- API routes: `/api/bonds`, `/api/bonds/:id`, `/api/bonds/:id/history`, `/api/bonds/:id/benchmark`, `/api/bonds/relative-value`, `/api/bonds/curve?linkage=cpi|nominal`, `/api/bonds/spreads`, and `/api/bonds/source-status`. Filtering and pagination are null-safe. The screener supports issuer, linkage, rating, duration, maturity, volume, stale quote, and sort controls.
- CPI-linked bonds select the BOI real government curve; nominal bonds select the nominal curve. Matching uses modified duration (or source duration); if unavailable it uses maturity in years and labels the lower-quality maturity interpolation. Out-of-range points use an explicitly labeled nearest-curve fallback. Spread is `(bond YTM - government benchmark yield) * 100` basis points. Spread/duration is only an informal heuristic, not OAS, Z-spread, or a standard credit measure.
- Benchmark snapshots use insert-ignore semantics by bond/date/calculation version. Once licensed observations exist, the daily scheduled benchmark refresh will create benchmark/spread history without replacing previous snapshots. Price/yield spread changes use actual stored observation rows only.
- Staleness uses last trade date (or source observation date if absent), a configurable three-business-day threshold, and weekend-aware business-day age. Quote-to-government-curve date differences over three calendar days are flagged as estimated; the UI warns that timestamps differ. Missing prices, ratings, duration, security, schedules, and collateral remain null.
- Yield/duration and spread/duration charts use separate CPI-linked or nominal views, neutral issuer colors, and no goodness ranking. Summary medians are withheld until at least three fresh observations are available.

### Verification when an entitlement is obtained

1. Register the project in TASE DATA HUB; receive approval for the exact bond, security master, EoD/history, amortization, and rating-related products needed.
2. Confirm internal use versus distribution rights, instrument coverage, observation/update frequency, historical depth, API schemas, and rate limits.
3. Add the credential through a local/Cloudflare secret, implement the authenticated response parser against those schemas, and test field nullability/revision hashes using licensed test data.
4. Verify the adapter against the approved live product, ingest a permitted sample into a non-production D1 database, then run migration, unit tests, typecheck, build, and Wrangler dry-run.
