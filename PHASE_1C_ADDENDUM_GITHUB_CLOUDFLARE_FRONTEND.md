# Phase 1C Addendum — GitHub Remote + Cloudflare Frontend Connection

## Confirmed Git remote

Use this repository for the Israel Macro / Rates / Bond Analyzer project:

`https://github.com/Comeon2022/bond-analyzer.git`

This is now the authorized repository for this dashboard.

The previous restriction against pushing because no dashboard remote existed is superseded by this instruction.

Still:
- NEVER push this project to RAGOps.
- Verify the local project folder is the bond dashboard before Git initialization.
- Do not modify any unrelated repository.

---

# 1. Git setup

From the local `bond dashboard` project directory:

```powershell
git rev-parse --show-toplevel
```

If it is NOT already a Git repository:

```powershell
git init
git branch -M main
git remote add origin https://github.com/Comeon2022/bond-analyzer.git
```

If it IS already a Git repository:

```powershell
git remote -v
```

If `origin` is missing:

```powershell
git remote add origin https://github.com/Comeon2022/bond-analyzer.git
```

If `origin` exists but is not the dashboard repo, stop and report it rather than overwriting an unrelated remote.

Before push:

```powershell
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
```

Then:

```powershell
git add .
git commit -m "Implement Israel bond analyzer dashboard"
git push -u origin main
```

If the GitHub repository already contains commits, fetch first and reconcile rather than force-pushing.

Never use `--force` unless the user explicitly asks.

---

# 2. Deployment architecture

The user wants to configure Cloudflare manually.

Use a clean split:

## Frontend
Cloudflare Pages

GitHub repo:
`Comeon2022/bond-analyzer`

Branch:
`main`

Framework:
`React (Vite)`

Build command:
`npm run build`

Build output directory:
`dist`

Root directory:
- leave empty if `package.json` is at repository root
- otherwise set it to the actual frontend project subdirectory

Do not guess the root directory. Inspect the repository structure.

## Backend
Cloudflare Worker

The Worker provides:
- `/api/overview`
- macro/rates endpoints
- Phase 1B endpoints
- Phase 1C bond endpoints
- scheduled ingestion
- D1 access

D1 remains bound to the Worker, not directly to the static React frontend.

---

# 3. Frontend-to-Worker API connection

Add an explicit frontend API base URL.

## Environment variable

Frontend code must use:

`VITE_API_BASE_URL`

Example production value:

`https://<worker-name>.<account-subdomain>.workers.dev`

or later:

`https://api.<custom-domain>`

Do not hard-code a temporary Worker URL throughout components.

Create one shared API client module.

Suggested:

`src/lib/api.ts`

Example behavior:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export function apiUrl(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}
```

All frontend requests should call the shared client.

Examples:

```ts
fetch(apiUrl('/api/overview'))
fetch(apiUrl('/api/regime/history'))
fetch(apiUrl('/api/bonds/relative-value'))
```

Never scatter absolute URLs across components.

---

# 4. Local development

Use a local environment file:

`.env.local`

Example:

```env
VITE_API_BASE_URL=http://localhost:8787
```

Do NOT commit `.env.local`.

Ensure `.gitignore` includes:

```gitignore
.env
.env.local
.env.*.local
```

For production Pages, the user will manually create:

Cloudflare Pages → Settings → Environment variables

Variable:

`VITE_API_BASE_URL`

Value:
the production Worker URL.

Because Vite injects `VITE_*` variables at build time, changing this variable requires a new Pages deployment.

---

# 5. CORS

Because Pages and Worker may use different hostnames, the Worker must explicitly support CORS.

Do not use unrestricted `*` once the production Pages domain is known unless there is a specific reason.

Add Worker configuration such as:

Allowed development origins:
- `http://localhost:5173`

Allowed production origins:
- `https://bond-analyzer-av2.pages.dev`
- future custom frontend domain if configured

Prefer configurable environment values rather than hard-coded origin arrays.

Suggested Worker env var:

`ALLOWED_ORIGINS`

Example:

```text
http://localhost:5173,https://bond-analyzer-av2.pages.dev
```

The Worker should return:

- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods`
- `Access-Control-Allow-Headers`
- `Vary: Origin`

Handle `OPTIONS` requests.

Do not reflect arbitrary request origins.

---

# 6. API health / connection UX

Add a small connection status to the frontend.

The app should distinguish:

- API connected
- API unavailable
- data source stale
- no data yet

Do not show an empty chart as if it were a valid zero.

Suggested health endpoint:

`GET /api/health`

Response should include only operational metadata, for example:

```json
{
  "ok": true,
  "service": "bond-analyzer-api",
  "timestamp": "...",
  "database": "reachable"
}
```

Do not expose secrets, Cloudflare account IDs, D1 IDs, tokens, or environment contents.

Frontend:
- call health on initial load
- show a small source/API status indicator
- API failure should not crash the entire React app

---

# 7. Production D1 connection

The Worker must use the real D1 binding.

Before live deployment:
1. Create or identify the D1 database.
2. Put the actual database ID in `wrangler.toml`.
3. Apply migrations remotely.
4. Verify the schema.
5. Deploy Worker.
6. Run ingestion.
7. Verify `/api/health`.
8. Verify `/api/overview`.
9. Only then point Pages `VITE_API_BASE_URL` to the Worker.

Do not put the D1 database ID in frontend environment variables.

The browser must never connect directly to D1.

---

# 8. Cloudflare Pages settings — manual user setup

Based on the current project setup, the expected Pages settings are:

- Project name: `bond-analyzer`
- Production branch: `main`
- Framework preset: `React (Vite)`
- Build command: `npm run build`
- Build output directory: `dist`

Root directory:
- blank when the Vite `package.json` is at repository root
- otherwise the project subdirectory

Environment variable:
- `VITE_API_BASE_URL=<production Worker URL>`

The user will configure these manually.

---

# 9. Routing

React is a SPA.

If the app uses client-side routes such as:

- `/bonds`
- `/bond/:id`
- `/macro`

ensure Cloudflare Pages serves the SPA fallback correctly.

For a standard static Pages deployment, add the appropriate Pages SPA routing/fallback only if needed by the router setup.

Test direct navigation to nested routes, not only navigation from `/`.

---

# 10. Frontend API types

Do not use untyped `any` payloads.

Add shared frontend response types for:

- Overview
- Signal
- Regime
- Yield curves
- Inflation expectations
- Global context
- Risk proxy
- Bonds
- Bond detail
- Bond history
- Relative value

Validate unknown/null states.

Do not assume every API field is always populated.

---

# 11. Loading / error / stale states

Every frontend data panel must support:

- loading
- success
- empty
- stale
- error

Examples:

`טוען נתונים...`

`אין עדיין נתונים זמינים`

`הנתון האחרון ישן`

`לא ניתן להתחבר לשרת הנתונים`

Do not convert API errors to zero.

---

# 12. Manual deployment sequence

Recommended order:

## Step A — GitHub
Push verified project to:
`https://github.com/Comeon2022/bond-analyzer.git`

## Step B — Worker backend
User manually deploys / configures Worker and D1.

Verify:
- Worker URL works
- D1 binding works
- migrations applied
- ingestion works
- API endpoints return real data

## Step C — Cloudflare Pages
Connect:
`Comeon2022/bond-analyzer`

Settings:
- `main`
- React (Vite)
- `npm run build`
- `dist`

Set:
`VITE_API_BASE_URL=<Worker URL>`

Deploy.

## Step D — browser verification
Test:
- dashboard loads
- API indicator connected
- macro cards populate
- curves populate
- inflation expectations populate
- global context populates
- bond page handles source-pending / real values correctly
- refresh works
- direct nested routes work
- browser console has no CORS errors

---

# 13. Security

Never expose in Vite environment variables:
- D1 IDs that are not needed client-side
- Cloudflare API tokens
- account secrets
- FRED keys if later required
- private source credentials

Remember:
all `VITE_*` variables are visible to browser users.

Only put public configuration in `VITE_*`.

---

# 14. README / handoff changes

Update README with:

- GitHub repo
- Pages build settings
- Worker deployment architecture
- `VITE_API_BASE_URL`
- local `.env.local`
- CORS configuration
- manual production deployment sequence
- D1 remote migration sequence

Update `CHATGPT_HANDOFF.md` with:

- repository initialized / reused
- remote URL
- commit SHA
- push result
- Worker deployment status
- Pages integration code
- CORS implementation
- health endpoint
- environment variables required
- remaining manual user steps

---

# 15. Required verification

Before committing:

```powershell
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
```

Also verify:
- no secrets committed
- `.env.local` ignored
- frontend production build succeeds with a sample `VITE_API_BASE_URL`
- CORS tests pass
- `/api/health` tests pass
- API failure UI does not crash
- existing Phase 1A/1B/1C tests remain green

---

# 16. Acceptance criteria

This addendum is complete when:

1. Git remote is `https://github.com/Comeon2022/bond-analyzer.git`.
2. Dashboard changes are committed and pushed to `main`.
3. Frontend uses one configurable `VITE_API_BASE_URL`.
4. Frontend never talks directly to D1.
5. Worker CORS is production-safe.
6. Worker exposes a safe health endpoint.
7. Frontend displays API connection failure gracefully.
8. React/Vite builds to `dist`.
9. Cloudflare Pages settings are documented.
10. Manual deployment order is documented.
11. No secrets are committed.
12. `CHATGPT_HANDOFF.md` is updated.
