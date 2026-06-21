# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **purely static**, white-label **Vereins-Baukasten** (generic German club website; German-language
UI). The repo is the generic product; an individual club runs its own site as a **fork** with its
branding as configuration (see `docs/fork-onboarding.md`). Reference customer *BSG Benninghausen*
runs as its own fork (`bsg-benninghausen.github.io/website`); the default example here is the neutral
*Musterverein*. No build step, no framework, no dependencies — just HTML, CSS, and vanilla JS. All "server"
behavior is **mocked in the browser**: `assets/js/mock-api.js` patches `window.fetch`, answers
every `/api/*` request locally, and persists data in `localStorage`. The dispatcher is also a
**mock⇄real router**: `assets/js/api-config.js` (loaded before `mock-api.js`) sets
`window.BSG_API = { mode: "mock"|"real"|"hybrid", base, live }`, and the patched `fetch` forwards
"live" routes to a real backend (`base + path`, `credentials:"include"`) while the rest stay
mocked. Default is `mock`. Switch via `?api=real|hybrid|mock`, `localStorage.bsg_api_mode`, the
`api-config.js` deploy default, or `BSGApi.setMode()/setLive()` at runtime — so UI features are
built against the mock and mature backend endpoints get promoted one at a time. Same `/api/*`
contract on both sides; the frontend code never changes.

## Commands

There is **no build step and no dependencies** — but there is a committed, zero-dep test suite:

```bash
# Local preview (must be over HTTP, not file://, because pages fetch JSON)
python3 -m http.server 8000      # then open http://localhost:8000

# Syntax-check any JS you changed
node --check assets/js/<file>.js

# Contract tests (run from repo root) — exits non-zero on failure
node tests/run.mjs                       # mock mode (default)
node tests/run.mjs tournaments payouts   # filter by filename substring
TEST_BASE=http://localhost:3000 node tests/run.mjs   # against a real backend

# Browser-E2E (Playwright) — isolated devDeps under tests/e2e/ (site stays zero-dep)
cd tests/e2e && npm install && npx playwright install chromium   # one-time (Linux: add --with-deps for system libs, as CI does)
npx playwright test                      # Playwright boots server/ itself, runs Chromium
```

**Contract-test suite (`tests/`).** Same assertions validate either the in-process mock OR a real
backend (selected by `TEST_BASE`) — this is what keeps the mock contract and a future backend in
sync. `tests/harness.mjs` exposes `createClient({mode,base})` with API-only helpers (`login`,
`newUser`, `me`, `asAdmin`, `setHousehold`, `email`); mock mode loads `mock-api.js` into an
**isolated sandbox** (per-suite fresh `window`/`localStorage`, seed JSON from disk), real mode does
HTTP with a cookie jar. Each `tests/*.test.mjs` is one domain suite (`export const name`,
`export default async (api, ck) => …`; `export const mockOnly = true` for dispatcher-only suites
like `api-switch`). Tests never touch `localStorage` directly and use per-run unique emails so they
can run against a persistent backend. When you add/change a route, add or update a suite. See
`tests/README.md` for the backend contract a real implementation must satisfy.

## Critical conventions

- **Cache-busting is mandatory.** Every local CSS/JS include is tagged `?v=N` (e.g.
  `mock-api.js?v=18`). When you change *any* JS or CSS, bump `N` on **all** `*.html` at once:
  `grep -rl "v=N" *.html | xargs sed -i 's/?v=N/?v=N+1/g'`. Forgetting this means users get stale code.
- **Don't push to `main`.** Work on a feature branch off `origin/main`, open a (draft) PR, then
  squash-merge to `main`. GitHub Pages auto-deploys from `main` via `.github/workflows/deploy-pages.yml`
  (only `main` and the legacy `claude/bsg-website-redesign-dio9co` branch trigger deploys). Tests run
  in CI via `.github/workflows/ci.yml` on every PR and push to `main` (contract job: mock + real;
  e2e job: Playwright/Chromium) — keep both green.
- **Editing `assets/data/*.json` only affects fresh `localStorage`.** These files are *seeds*:
  `ensureX()` copies them into the store on first read, after which the store is the source of
  truth (editable via the Redaktion UI). To re-seed in a browser, clear the site's localStorage.

## Architecture

### The mock server (`assets/js/mock-api.js`)
This single file is the backend. Key pieces:
- `routes` — an object keyed by exact `"METHOD /api/path"` strings; the patched `fetch` dispatches to these.
- `KEYS` — every `localStorage` key (`bsg_users`, `bsg_events`, `bsg_registrations`, `bsg_payouts`, …).
- Helpers reused everywhere: `json(body, status)`, `getStore/setStore`, `currentUser()`,
  `hasPerm(user, perm)`, `norm()`, `genId()`, `loadData(file)` (fetches a seed JSON), and the
  `ensureNews/ensureEvents/ensureTraining/ensureSite` **seed-on-read** functions.
- `seed()` runs on load: guarantees system roles + admin account and applies **versioned, additive
  migrations** gated by `bsg_seed_version` (e.g. `if (seedVersion < 4) { …grant new perms…; setStore(…,4) }`).
  When you add a permission or change example-role grants, add a new migration and bump the version —
  never mutate existing data destructively.

### Permissions & roles
- `PERMISSIONS` is the catalog; `ALL_PERMS` derives from it; the **admin role always gets all perms**
  dynamically in `userPermissions()`, so new permissions need no admin migration.
- The Admin role editor (`admin.js`) renders checkboxes from `GET /api/permissions` automatically —
  adding a key to `PERMISSIONS` surfaces it in the UI with no further wiring.
- To add a permission: add to `PERMISSIONS`; grant it to relevant `EXAMPLE_ROLES` + a seed migration;
  gate the backend routes with `hasPerm(user, key)`; reveal nav/UI in the frontend (see below). Rights
  are intentionally **fine-grained, one per content area** (`manage_news`, `manage_events`,
  `manage_training`, `manage_site`, `manage_team`, `manage_payouts`, `manage_features`, plus
  `view_*`/`manage_roles/users`).
- **Roles are pure permission objects** (`{id, label, permissions[], system}`) — they grant rights
  and never appear publicly. The public **Team page is computed from a separate `positions` store**
  (`{userId, group, label, order}`, `group ∈ vorstand/trainer`), curated under Admin → Vereinsämter
  via `GET/POST /api/positions(/update/delete)` (gated by `manage_team`). `GET /api/team` keeps its
  shape (`{group,label,order,name,photo}`) but computes it from **positions × users**. So holding a
  role (e.g. a stand-in with news rights) does not list someone on the team, and a web admin need not
  appear with a photo. Name & photo come from the user account.

### Frontend wiring
- `assets/js/main.js` defines the global `BSG.*` helpers (`escape`, `formatDate`, `dayMonth`,
  `placeholderSVG`, `readAndResize` for client-side image resize→data-URL) and the **permission-based
  nav reveal**: it fetches `/api/auth/me` and un-hides `[data-redaktion-link]` / `[data-members-link]` /
  `[data-admin-link]` based on the user's permissions. It also applies editable homepage texts to
  `[data-site="key"]` elements.
- Each page loads `mock-api.js` + `main.js` + a page-specific script (`konto.js`, `redaktion.js`,
  `kalender.js`, `news.js`, `trainingszeiten.js`, `team.js`, `mitglieder.js`, `admin.js`, …). Protected
  pages guard access by re-checking `me.permissions` and redirecting.
- `redaktion.js` is the dynamic-content editor hub; reuse its `setupEditor({listEl, form, api, render,
  collect, onFill, onReset})` helper (CRUD list+form with hooks) for any new editable content type.

### Product portal & reference examples
- **`index.html` is a generic product portal**, not the club site. The BSG club homepage lives at
  **`home.html`**; all other club pages stay at the root and link to `home.html` for "Start". The
  portal is fully static (no `mock-api.js`/`main.js`), renders example cards via `portal.js`, and
  registers the service worker itself.
- **`assets/js/club-config.js`** (loaded **synchronously in `<head>`**, before `styles.css` and
  `mock-api.js`) is the example **registry + resolver**. It picks the active example from
  `?club=<id>` → `localStorage bsg_example` → default, exposes `window.BSG_CLUB = {id,name,clubSeed,
  theme,ns}` + `window.BSG_EXAMPLES`, and on club pages (`<html data-club-site>`) injects the
  example's theme FOUC-free. The cache-bust `?v=N` for the injected theme is read from its own
  script tag, so the standard HTML bump keeps it in sync.
- **One frontend, many configs:** `mock-api.js` namespaces every `localStorage` key with
  `BSG_CLUB.ns` (the default `bsg` keeps the legacy `bsg_*` keys, so tests/existing deployments are
  untouched), and `ensureClub()` seeds from `BSG_CLUB.clubSeed`. **New example = one entry in
  `club-config.js` + `assets/data/club.<id>.json` + a theme**, no other code. See
  `docs/productization-saas-plan.md` §5a.

### Feature gating & Beta releases
A capability layer hides features that have no real backend (so production never suggests
non-existent functionality) and marks new ones as Beta. **Two orthogonal axes** per feature:
a **maturity** `status` (`beta`/`stable`) declared in the `FEATURES` catalog (mirrored in
`mock-api.js` and `server/api.mjs` — the catalog itself is the contract; a real backend that hasn't
caught up simply omits the key, hiding it in `real` mode), and a **release scope**
(`"public"|"off"|{roles:[…]}`) set at runtime by a superadmin (`manage_features`) and stored in
`bsg_feature_flags`. `GET /api/capabilities` is **user-specific**: returns only features the current
user may see (`public` → all; `{roles}` → user holds the role *or* has `manage_features`; `off` →
only `manage_features` preview). Internal vs. public Beta = release to a role vs. to `public`.
`assets/js/features/loader.js` (ES module, `<script type="module">`) gates `[data-feature="key"]`
elements: hides the un-granted ones and — crucially for isolation — only **dynamically `import()`s**
a feature's module (`assets/js/features/<key>.js`, default-exports `init(rootEl)`) when granted, so
disabled feature code never runs and can't break stable features. Badges (`.badge--beta`/`--intern`)
go into a `[data-feature-badge]` slot. Manage releases under Admin → „Features & Beta-Freigabe".
A **third, orthogonal axis** sits *above* release: **booking/provisioning** (which features are even
provisioned for this tenant/tarif). Permission `book_features` + store `bsg_feature_bookings` /
`db.featureBookings` + routes `GET /api/bookings` / `POST /api/features/book` `{key,booked}` (Admin →
„Funktionen buchen"). `FEATURE_DEFAULT_BOOKED` defaults to booked, so nothing changes until a feature
is un-booked. `GET /api/capabilities` filters **booked × released**: an un-booked feature is hidden
for **everyone** (even the `manage_features` preview), regardless of scope — the booking gate runs
*before* `canSeeFeature`. In the mock this is self-service; a real SaaS would gate booking by
subscription/billing (a later phase). See `docs/productization-saas-plan.md`.

### Domain config templates
`assets/data/age-classes.json` and `weight-classes.json` are editable, club-adjustable templates that
**drive filtering** (competition age classes from birth-year/gender; weight classes pre-filtered to the
member's age category + gender). The filtering logic in the code is authoritative; the kg/age values are
placeholders to be aligned with the relevant federation (DJB) rules. Mirror this pattern (data template +
a `xFor(age, gender, cfg)` helper + a `GET /api/x` route) for similar domain-specific option lists.

## Money/registration model (tournaments)
Events of type `Turnier`/`Meisterschaft` carry `fee` (Gebühr), `ownShare` (Eigenanteil; the club covers
`fee − ownShare`), `ageClasses`, and `organizerName`/`organizerIban`. Members register via the dashboard
(filtered to eligible members). The **payout to the organizer = `fee × registration count`** (the full
participation fee; the ownShare/club split is internal and only shown informationally). Payouts are mocked
(recorded in `bsg_payouts`, no real payment) and gated by `manage_payouts`.

See `README.md` for the full endpoint table and feature/page descriptions.
