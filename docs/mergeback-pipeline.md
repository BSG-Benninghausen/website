# Mergeback-Pipeline: Fork → Hauptrepo → Backend (automatisiert)

Dieses Repo ist das **generische, white-label Produkt**. Vereine betreiben es als **Fork** und fügen
nur Konfiguration hinzu (siehe [`fork-onboarding.md`](fork-onboarding.md)). Verbesserungen am Produkt
sollen **vereins-neutral** ins Hauptrepo zurückfließen ([`../CONTRIBUTING.md`](../CONTRIBUTING.md)).

Die Mergeback-Pipeline automatisiert genau diesen Rückfluss: auf dem Fork wird etwas implementiert;
sobald dort ein PR existiert, prüft ein Agent automatisch, ob/welcher Anteil ins Hauptrepo gehört,
neutralisiert ihn und mergt ihn bei grünem CI automatisch zurück. Ändert das den `/api/*`-Vertrag,
geht es weiter zum Backend-Repo zur Implementierung der realen API.

> **Mechanismus:** GitHub Actions + [`anthropics/claude-code-action`]. **Topologie:** Fork-seitig
> (der Bot baut den Upstream-PR, nicht der Entwickler). **Autonomie:** Auto-Merge bei grün im
> Hauptrepo; das Backend bekommt **Draft-PRs** (reale Persistenz/Deploy → bewusst Mensch-Review).

## Überblick

```
  FORK (Verein)                  HAUPTREPO (Produkt)               BACKEND-REPO (reale API)
  mergeback-propose.yml   ─PR→   mergeback-gate.yml          ─dispatch→  contract-implement.yml
   classify-diff (Verdict)        ci.yml (Required Checks):              Contract-Dep + seeds vendoren
   --neutralize (det.+Agent)      contract mock+real, e2e                Agent implementiert api.mjs
   → vereins-neutraler Branch     + classify --verify (Recheck)         TEST_BASE=… bsg-contract grün
   → PR gegen main                + Agent-Review (Konventionen)          → Draft-PR (Mensch reviewt)
   → Kommentar auf Fork-PR        → Auto-Squash-Merge bei grün
                                  contract-notify.yml (push:main):
                                  detect-contract-change → Tag contract-vX.Y.Z
                                  → publish-contract.yml + repository_dispatch ─────────┘
```

## Die Grenze: generisch vs. config

Einzige Quelle der Wahrheit ist [`../upstream-manifest.json`](../upstream-manifest.json). Es kodiert
maschinenlesbar, was Produkt (fließt zurück) und was Vereins-Config ist (bleibt im Fork):

- **generisch** (`generic_globs`): `assets/js/*.js`, `assets/css/styles.css`, `*.html`,
  `service-worker.js`, `tests/**`, `packages/**`, `tools/**`, `.github/**`, `docs/**`, `*.md`.
- **config/branding** (`config_globs`): `assets/data/**`, `assets/css/theme.*.css`, `assets/img/**`.
- **gemischt** (`mixed_files`): `assets/js/club-config.js` — die Resolver-Logik ist generisch, aber
  Einträge im `EXAMPLES`-Array sind club-spezifisch.
- **forbidden_patterns / identity_field_keys / neutral_replacements**: fangen geleakte Identität
  (Namen, Handles, Adressen) ab und liefern die neutralen Ersatzwerte aus `neutral_baseline`
  (`packages/api-contract/data/club.example.json`).

### Werkzeuge (zero-dep, getestet via `node --test tools/*.test.mjs`)

| Tool | Zweck |
|------|-------|
| `tools/classify-diff.mjs` | Diff → Verdict `propose`/`nothing`/`needs_human`; `--neutralize` (Include-Liste + Ersetzungen); `--verify` (Gate: 100 % generisch & identitätsfrei) |
| `tools/detect-contract-change.mjs` | erkennt `/api/*`-Vertragsänderungen; `--bump` → `major`/`minor`/`patch`/`none` |
| `tools/bump-cachebust.mjs` | erhöht `?v=N` + SW-`VERSION` (Frische nach JS/CSS-Änderung) |

## Die Stufen

1. **Fork — [`mergeback-propose.yml`](../.github/workflows/mergeback-propose.yml).** Bei jedem
   Fork-PR: Diff gegen `upstream/main` klassifizieren. `nothing`/`needs_human` → nur Kommentar.
   `propose` → neutralen Branch aus `upstream/main` + generischen Dateien bauen, deterministisch +
   per Agent neutralisieren, `--verify`, dann PR gegen `main` öffnen/aktualisieren (Label `mergeback`).
2. **Hauptrepo — [`mergeback-gate.yml`](../.github/workflows/mergeback-gate.yml).** Auf den Bot-PRs:
   Neutralitäts-Recheck (vertrauenswürdige Base-Tools, PR nur als Daten — `pull_request_target`-sicher),
   Agent-Review der CLAUDE.md-Konventionen → Check `mergeback/agent-review`. **Auto-Squash-Merge**,
   sobald alle Required Checks grün sind (Contract mock+real, E2E, `mergeback/agent-review`).
3. **Hauptrepo — [`contract-notify.yml`](../.github/workflows/contract-notify.yml).** Bei Merge auf
   `main` mit Vertragsänderung: Version bumpen, Tag `contract-vX.Y.Z` (→ `publish-contract.yml`),
   `repository_dispatch` ans Backend-Repo.
4. **Backend — [`contract-implement.yml`](mergeback/contract-implement.yml) (Template).** Hebt die
   Contract-Dep, lässt einen Agenten die reale Route in `api.mjs` implementieren, verifiziert gegen
   `TEST_BASE=… bsg-contract` und öffnet einen **Draft-PR**.

## Eskalations-Labels

| Label | Bedeutung |
|-------|-----------|
| `mergeback`, `automated` | vom Bot erzeugter Upstream-PR |
| `needs-human` | Auto-Merge gestoppt (entangled, Rest-Identität, Review < 90, …) → manuell prüfen |
| `do-not-merge` | hält den Auto-Merge generell an |

## Sicherheit

- **`pull_request_target`-sicher:** das Gate checkt die **Basis** (main) aus und behandelt den PR nur
  als **Diff-Daten** — kein Ausführen von PR-Head-Code mit Secrets. Die Tests laufen getrennt in
  `ci.yml` (`pull_request`, `contents:read`).
- **Dreifacher Neutralitäts-Check:** classify (Fork) → Agent-neutralize → `--verify` (Gate), alle
  fail-closed.
- **Least privilege:** Cross-Repo-Pushes über eine **GitHub-App** mit kurzlebigen, repo-gescopten
  Tokens. `GITHUB_TOKEN` reicht dafür nicht.
- **Loop-Schutz:** propose ist No-op im Hauptrepo / bei Bot-Actor / `mergeback/*`-Branch;
  `contract-notify` überspringt eigene `chore(contract): bump`-Commits.

---

## Einrichtung (einmalig, manuell — außerhalb dieses PRs)

Diese Schritte erfordern Repo-Adminrechte bzw. Aktionen außerhalb des Codes und sind daher **nicht**
Teil des Tooling-PRs:

1. **GitHub-App „Mergeback Bot"** anlegen (Repository permissions: *Contents* RW + *Pull requests* RW;
   Webhook „Active" aus). **Installieren** auf `crypticalcode/vereins-baukasten` (damit der Fork-
   Proposer dorthin pushen darf) **und** auf `crypticalcode/bsg-backend` (damit `contract-notify`
   dispatchen darf). App ID + Private Key als Secrets `MERGEBACK_APP_ID` / `MERGEBACK_APP_PRIVATE_KEY`
   hinterlegen — **im Fork** (für `mergeback-propose`) **und im Hauptrepo** (für `contract-notify`).
   Das Backend-Repo selbst braucht die App **nicht** (same-repo `github.token`). *Fallback:* fine-
   grained PAT pro Repo (`MERGEBACK_TOKEN`).
2. **Secrets/Variablen setzen:** Agent-Auth in allen Repos mit Agent-Schritten — entweder
   `CLAUDE_CODE_OAUTH_TOKEN` (Claude Pro/Max-Abo; lokal via `claude setup-token` erzeugen) **oder**
   `ANTHROPIC_API_KEY` (pay-as-you-go). Die Workflows nutzen `claude_code_oauth_token`; für den
   API-Key-Weg den Input in den drei Agent-Schritten auf `anthropic_api_key` umstellen.
   `vars.MERGEBACK_ENABLED=true` (Hauptrepo + opt-in je Fork); im Backend-Repo zusätzlich ein
   `read:packages`-Token für die `@crypticalcode/api-contract`-devDependency.
3. **Branch Protection auf `main`:** Required Checks = `Contract-Tests (Mock & Real)`,
   `Browser-E2E (Playwright)`, `mergeback/agent-review`; „up to date before merge"; Squash-only;
   Direct-Push einschränken. (Erst in den letzten Rollout-Schritten scharf schalten.)
4. **Vorbedingung — Identität im Hauptrepo neutralisieren:** die ausgelieferten HTML-Seiten linken
   noch hart auf `instagram.com/bsg_benninghausen` (14 Dateien). Vor dem Scharfschalten in einem
   eigenen PR auf die neutralen `club.example.json`-Werte umstellen, sonst flaggt das Gate `main`
   selbst. Prüfen mit `tools/classify-diff.mjs --verify` gegen einen entsprechenden Diff.
5. **Backend-Stufe — Phase-3-Split** gemäß [`phase-3-backend-split-runbook.md`](phase-3-backend-split-runbook.md)
   ausführen; danach [`mergeback/contract-implement.yml`](mergeback/contract-implement.yml) ins
   Backend-Repo nach `.github/workflows/` kopieren.

## Rollout-Reihenfolge (Auto-Merge zuletzt)

1. Tooling + Self-Tests (dieser PR). 2. Identitäts-Leak in `main` neutralisieren. 3. Proposer
**kommentar-only** am Wegwerf-Fork testen. 4. Cross-Repo-PR (App) → manueller Merge. 5. Gate
**review-only** (Check ohne `--auto`). 6. Branch Protection. 7. **Auto-Merge an** (Schwelle erst
≥ 95, später ≥ 90). 8. `contract-notify` + `publish-contract --dry-run`. 9. Phase-3-Split.
10. `contract-implement` (Draft-PRs). 11. Docs finalisieren.
