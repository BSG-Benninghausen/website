# CLAUDE.md

> This file lives in the **main repo** (the generic product) and is pulled downstream by every
> **club fork**. Keep it lean: it is the contract for how forks, the main repo, and the backend
> collaborate — not an architecture encyclopedia. Deep detail lives in `README.md` and `docs/`.

## What this is

A **static-first**, white-label **Vereins-Baukasten** (generic German club website; German UI). The
repo is the generic product; a club runs its own site as a **fork** with its branding as
**configuration** — additive, club-owned files, so `git pull upstream main` stays conflict-free (see
`docs/fork-onboarding.md`). The default example here is the neutral *Musterverein*; reference
customer *BSG Benninghausen* runs as its own fork (`bsg-benninghausen.github.io/website`).

The static site (HTML/CSS/vanilla JS) is **fully usable on its own**: `assets/js/mock-api.js` patches
`window.fetch` and answers every `/api/*` request locally from `localStorage`. The **paid product is
API access** — a real backend (`packages/backend/`, deployed per tenant) implements the same `/api/*` contract,
and `assets/js/api-config.js` routes `mock | hybrid | real`, so endpoints are promoted one at a time.
**Same `/api/*` contract on both sides; the frontend code never changes.**

## The collaboration model (read this first)

Three cooperating places, one shared contract:

- **Main repo** — the generic product: static frontend + the mock backend (`mock-api.js`), which
  doubles as the **executable spec** of the `/api/*` contract, + the contract tests (`tests/`). This
  `CLAUDE.md` and shared features flow **main → forks** via `git pull upstream main`.
- **Club forks** — one per club. Branding is **configuration in additive, club-owned files**
  (`club.<id>.json`, `theme.<id>.css`, a `club-config.js` registry entry; setup in
  `docs/fork-onboarding.md`); features are built here to club wish against the mock. Because club
  files aren't upstream's, pulls stay conflict-free. Club content lives in editable seeds
  (`assets/data/*.json`).
- **Real backend** — `packages/backend/` implements the `/api/*` contract; deployed per tenant (Hetzner). API
  access is the paid layer. (Future repo split: `docs/backend-repo-separation-plan.md`.)

Flow (🔜 = target; automation not yet wired):

1. A fork builds a feature against the mock (a `/api/*` route + `localStorage`). It works standalone,
   no real backend required.
2. The fork **contributes back** vereins-neutral fixes/features as a **PR to main** (see
   `CONTRIBUTING.md`). 🔜 An agent (GitHub Actions + Claude hooks) triages whether/what is generic
   enough to land upstream, and with what changes; club-specific parts stay in the fork.
3. 🔜 Once a route is in the main contract, the **backend is developed against it** and the endpoint
   is promoted `mock → hybrid → real` via `api-config.js`.

Today steps 2–3 are **manual**: open a (draft) PR to main, keep contract tests green, and promote
routes by editing `api-config.js`.

## Invariants (don't break these)

- **Static-first / graceful degradation.** Every feature must stay useful **without** the API — the
  API is the paid upgrade, not a hard dependency. A new network feature needs a no-API fallback
  (🔜 e.g. the contact form opens the user's mail client via `mailto:` when no API is configured;
  today `forms.js` only reports a connection error).
- **One contract, two implementations.** `mock-api.js` and the real backend (`packages/backend/`) must never
  diverge. The same suite in `packages/api-contract/` validates both (`node packages/api-contract/run.mjs`;
  `TEST_BASE=… node packages/api-contract/run.mjs` for real) and must stay green in CI. Add or change a route ⇒ add or update a suite.
- **Forks pull conflict-free.** Club customization lives in **additive, club-owned files**; don't
  bake club specifics into shared code. Seeds (`assets/data/*.json`) are per-club data a small club
  can hand-edit in its fork (🔜 a GitHub Action builds them into the DB seed). Editing a seed only
  re-seeds a *fresh* store (mock: clear localStorage; backend: a fresh tenant).
- **Don't push to `main`.** Feature branch → draft PR → squash-merge. GitHub Pages auto-deploys a
  fork's `main` in `mock` mode (the standalone demo); Beta/Prod deploy to Hetzner in `real` mode.
- **Cache-busting.** Every local CSS/JS include is tagged `?v=N`; bump it on **all** `*.html` when
  you change any JS/CSS (today manual; 🔜 set by a build step). A stale `?v` ships stale code.

## Commands

```bash
python3 -m http.server 8000          # local preview (must be HTTP — pages fetch JSON)
node --check assets/js/<file>.js     # syntax-check changed JS
node packages/api-contract/run.mjs   # contract tests (mock); TEST_BASE=… runs them against real
```

Browser-E2E (Playwright under `tests/e2e/`), test filters, and the full workflow list are in
`README.md`.

## Where the detail lives

- **`README.md`** — page/feature descriptions, the `/api/*` endpoint table, accounts/roles/
  permissions, the team/positions model, the tournament money model, content editing, CI/CD stages.
- **`docs/fork-onboarding.md`** — set up a club fork (config files, default club, deploy).
- **`CONTRIBUTING.md`** — contributing fixes/features back upstream from a fork.
- **`docs/productization-saas-plan.md`** — white-label config, multi-tenant, feature
  provisioning/booking, SaaS phases.
- **`docs/backend-repo-separation-plan.md`** — splitting the backend into its own repo + the shared
  contract package.
- **`packages/backend/README.md`** — the real backend and its persistence / multi-tenant seam.
- **`packages/api-contract/README.md`** — the contract a real backend must satisfy.
