# Phase 1D — Implement Free BOI Credit-Spread Ingestion

## Objective

Complete Phase 1D using only free, official Bank of Israel data.

The working public source is the BOI SDMX bulk dataflow:

`https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/SECDWH/1.0/?format=csv&lastNObservations=24`

Important verified behavior:
- The bulk endpoint works.
- Server-side filtering by `SERIES_CODE` does not work reliably and returned 404.
- Do not depend on server-side filtering.
- Pull the bulk CSV and filter locally.
- `DATA_TYPE=SPR` identifies spread observations in the verified payload.
- The verified 24-observation pull currently exposes three `SPR` series:
  - `DWH_SRC_0299_MA`
  - `DWH_SRC_0438_MA_T`
  - `DWH_SRC_0498_MA_T`
- Each currently has monthly history from 2024-10 through 2026-09.
- Do not invent human-readable names for metadata codes such as `I710`, `BS1096`, `BS1006`, `T`, `S1K`.
- Resolve labels only from official BOI SDMX codelists / metadata when available.

## Core implementation rule

Use dynamic discovery.

Do NOT hard-code an assumed complete list of rating groups, sectors, or Tel-Bond series.

Every ingestion run must:
1. Download the bulk SECDWH CSV.
2. Parse all rows safely.
3. Select `DATA_TYPE === "SPR"`.
4. Discover distinct spread series by `SERIES_CODE`.
5. Resolve metadata labels from BOI official metadata/codelists where possible.
6. Store observations and metadata in D1.
7. Preserve unknown codes without guessing labels.
8. Automatically support newly appearing official spread series later.

## Data model

Add an additive D1 migration.

Suggested tables:

### `credit_spread_series`
Fields:
- `series_code` TEXT PRIMARY KEY
- `frequency`
- `comp_category_code`
- `comp_category_label`
- `comp_name_code`
- `comp_name_label`
- `indexation_type_code`
- `indexation_type_label`
- `sec_rank_group_code`
- `sec_rank_group_label`
- `issuer_sector_code`
- `issuer_sector_label`
- `unit_measure`
- `source`
- `first_seen_at`
- `last_seen_at`
- `metadata_json`

### `credit_spread_observations`
Fields:
- `series_code`
- `time_period`
- `observation_value`
- `release_status`
- `payload_hash`
- `ingested_at`
- unique key on (`series_code`, `time_period`, `payload_hash`) or the repository's established revision-safe pattern.

Follow the existing revision/history conventions already used in the project.

## Source adapter

Add a dedicated BOI SECDWH credit-spread adapter.

Requirements:
- Fetch the bulk CSV from the official BOI endpoint.
- Use a configurable observation window; initial backfill should use at least 24 observations.
- Parse CSV defensively.
- Validate required columns:
  - `SERIES_CODE`
  - `DATA_TYPE`
  - `TIME_PERIOD`
  - `OBS_VALUE`
- Skip malformed rows.
- Keep only `DATA_TYPE=SPR`.
- Preserve monthly dates exactly as published.
- Do not interpolate missing months.
- Do not transform monthly values into daily observations.
- Preserve BOI source/provenance information.

## Metadata resolution

Inspect official BOI SDMX structure/codelist endpoints already identified during the audit.

Resolve labels for:
- `COMP_CATEGORY`
- `COMP_NAME`
- `INDEXATION_TYPE`
- `SEC_RANK_GROUP`
- `ISSUER_SECTOR`

Rules:
- Use BOI metadata only.
- If a label cannot be resolved, display the code plus `לא זוהה במטא־דאטה`.
- Never infer a rating, sector, or index name from the numeric/code shape.
- Cache metadata so every scheduled run does not needlessly refetch unchanged structures.

## API

Add:

### `GET /api/credit/spreads`
Return all discovered spread series with:
- series code
- resolved labels
- latest observation
- latest observation date
- 1M change
- 3M change
- history
- source
- stale status

### `GET /api/credit/spreads/:seriesCode`
Return:
- metadata
- full stored history
- latest
- 1M / 3M / 12M change where data exists
- source/provenance

### `GET /api/credit/summary`
Return:
- count of discovered spread series
- latest common observation period where applicable
- widest current spread
- narrowest current spread
- largest 3M widening
- largest 3M narrowing
- coverage / metadata-resolution status

These are descriptive statistics only, not investment rankings or recommendations.

## Frontend

Replace the Phase 1D blocked/empty free-credit section with a working dynamic panel.

Section title:
`שוק האשראי הקונצרני — נתוני בנק ישראל`

Show a badge:
`מקור רשמי חינמי`

Each series card/table row should show:
- official label if resolved
- series code in secondary text
- latest spread
- observation month
- 1M change
- 3M change
- indexation type
- rating group if present
- sector if present
- metadata unresolved warning if needed

Add a line chart for selected series.

Time ranges:
- 6M
- 1Y
- MAX

Do not show 3Y if only 24 months were ingested unless a larger historical backfill is implemented.

## Current verified data

The current bulk pull has three spread series with 24 monthly observations each.

Do not hard-code the current values into the app or migration.

Use them only as test fixtures if needed.

The ingestion must obtain the live values from BOI.

## “What changed?”

Add deterministic Hebrew summaries based only on stored observations, for example:
- `המרווח בסדרה X עלה ב־Y נ״ב לעומת החודש הקודם.`
- `המרווח בסדרה X ירד ב־Y נ״ב בשלושת החודשים האחרונים.`

Rules:
- convert percentage-point differences to basis points correctly
- no causal language
- no attractiveness / buy / sell language
- no invented series names

## Ingestion schedule

Integrate with the existing scheduled ingestion.

Because the source is monthly:
- it is acceptable for the daily Worker cron to check it
- repeated unchanged payloads must remain idempotent
- no duplicate observations/revisions for identical payloads

## Historical backfill

First implementation:
- pull at least `lastNObservations=24`
- if the endpoint safely supports a larger window, test and document it
- do not assume unlimited history
- prefer a bounded, reliable backfill over a fragile query

## Source status

Add source status:
`BOI SECDWH corporate spreads`

Expose:
- last successful fetch
- latest observation period
- row count
- discovered series count
- stale / healthy / failed

A failed source refresh must not delete the last valid stored data.

## Testing

Add tests for:
- bulk CSV parser
- `DATA_TYPE=SPR` filtering
- three currently verified series fixture
- unknown metadata code
- metadata label resolution
- duplicate/idempotent ingestion
- 1M change
- 3M change
- basis-point conversion
- missing month
- malformed observation
- API output shape
- Hebrew deterministic change summary

Keep all existing tests green.

## Production deployment

After implementation:

1. Apply the new D1 migration remotely:
   `npx wrangler d1 migrations apply bond-analyzer-db --remote`

2. Deploy:
   `npx wrangler deploy`

3. Run/trigger ingestion using the repository's existing supported mechanism.
   - Inspect the code first.
   - Do not invent an admin endpoint.
   - If ingestion only runs by scheduled handler, add a safe documented way to invoke it if appropriate, or verify via the actual supported path.

4. Verify production:
   - `/api/health`
   - `/api/credit/spreads`
   - `/api/credit/summary`

5. Confirm returned data is real BOI data and includes observation dates.

6. Verify Pages UI after API deployment.

## Git and handoff

- Work only in the `bond-analyzer` repository.
- Do not touch RAGOps.
- Update `CHATGPT_HANDOFF.md` with:
  - exact BOI endpoint used
  - metadata endpoints/codelists used
  - migration name
  - number of spread series discovered
  - latest observation period
  - production Worker URL
  - API verification results
  - test/typecheck/build results
  - known limitations
  - commit SHA
- Commit all Phase 1D implementation changes.
- Push to `origin/main`.

## Safety / data integrity

Do not:
- use TASE paid data
- scrape public TASE pages
- fabricate observations
- infer metadata labels
- seed live market values
- silently convert missing data to zero
- overwrite valid history after a failed refresh

## Acceptance criteria

Phase 1D is complete when:
1. BOI SECDWH bulk ingestion works in production.
2. `SPR` series are dynamically discovered.
3. Observations are stored in D1.
4. Official metadata labels are used when available.
5. Unknown labels remain explicitly unresolved.
6. Credit APIs return real stored BOI observations.
7. Frontend renders the discovered spread series and chart.
8. 1M and 3M changes are correct.
9. Source provenance/staleness is visible.
10. Existing tests plus new tests pass.
11. Typecheck passes.
12. Build passes.
13. Worker deploy succeeds.
14. Remote migration succeeds.
15. `CHATGPT_HANDOFF.md` is updated.
16. Changes are committed and pushed to `main`.
