# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **purely static** website for the Judo club *BSG Benninghausen e.V.* (German-language UI).
No build step, no framework, no dependencies — just HTML, CSS, and vanilla JS. All "server"
behavior is **mocked in the browser**: `assets/js/mock-api.js` patches `window.fetch`, answers
every `/api/*` request locally, and persists data in `localStorage`. The whole app is designed
so a real backend can later replace the mock by serving the same `/api/*` routes (and removing
the `mock-api.js` script tags) without touching the rest of the frontend.

## Commands

There is **no build/lint/test toolchain**. Verification is done by hand:

```bash
# Local preview (must be over HTTP, not file://, because pages fetch JSON)
python3 -m http.server 8000      # then open http://localhost:8000

# Syntax-check any JS you changed
node --check assets/js/<file>.js
```

**Tests** are throwaway Node harnesses (not committed; the sandbox cannot reach the deployed
site). They load `mock-api.js` into a stubbed environment and call routes directly. Recreate one
with this bootstrap, then assert against route responses:

```js
import { readFileSync } from 'fs';
class Response { constructor(b,i={}){this._b=b;this.status=i.status||200;this.ok=this.status>=200&&this.status<300;} async json(){return JSON.parse(this._b);} }
const store={}; global.localStorage={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
global.Response=Response; global.URL=URL; global.setTimeout=fn=>fn();
const win={location:{origin:'http://localhost'},fetch:async u=>new Response(readFileSync(u,'utf8'),{status:200})};
global.window=win;
new Function('window','localStorage','Response','URL','setTimeout','console',readFileSync('assets/js/mock-api.js','utf8'))
  (win,global.localStorage,Response,URL,global.setTimeout,{info(){}});
const post=(p,b)=>win.fetch(p,{method:'POST',body:JSON.stringify(b)}), get=p=>win.fetch(p);
// login(email) via request-code -> devCode -> /api/auth/login; seeded admin: admin@bsg-benninghausen.de
```

Run with `node harness.mjs`. The stub serves `assets/data/*.json` straight from disk, so seed-on-read works.

## Critical conventions

- **Cache-busting is mandatory.** Every local CSS/JS include is tagged `?v=N` (e.g.
  `mock-api.js?v=18`). When you change *any* JS or CSS, bump `N` on **all** `*.html` at once:
  `grep -rl "v=N" *.html | xargs sed -i 's/?v=N/?v=N+1/g'`. Forgetting this means users get stale code.
- **Don't push to `main`.** Work on a feature branch off `origin/main`, open a (draft) PR, then
  squash-merge to `main`. GitHub Pages auto-deploys from `main` via `.github/workflows/deploy-pages.yml`
  (only `main` and the legacy `claude/bsg-website-redesign-dio9co` branch trigger deploys; PRs run no CI).
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
  `manage_training`, `manage_site`, `manage_payouts`, plus `view_*`/`manage_roles/users`).
- Roles also carry optional `teamGroup`/`teamLabel`/`teamOrder` fields: the public **Team page is
  computed from roles × users** (`GET /api/team`) — there is no manual team store/editor.

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
