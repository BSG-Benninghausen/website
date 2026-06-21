#!/usr/bin/env bash
# =====================================================================
# extract.sh – packages/backend/ in ein eigenständiges Backend-Repo extrahieren.
# ---------------------------------------------------------------------
# Phase 3 von docs/backend-repo-separation-plan.md. Erzeugt aus dem Monorepo
# den vollständigen, install-freien Inhalt des Repos
# crypticalcode/vereins-baukasten-backend:
#
#   • packages/backend/{api,index,store,persistence}.mjs  -> Repo-Wurzel (flach)
#   • packages/api-contract/{run,harness,*.test}.mjs + data/ + README  -> contract/
#   • kanonische Seeds                                    -> data/ (Laufzeit, vendored)
#   • Standalone-Scaffolding (package.json, .gitignore,
#     tools/vendor-seeds.mjs, contract/mock-src.stub.js, ci.yml, README) aus templates/
#   • Seed-/Static-Pfade in index.mjs/persistence.mjs umgeschrieben (rewrite-paths.mjs)
#
# Domänenlogik (api.mjs, store.mjs) wird UNVERÄNDERT übernommen.
#
# Verwendung:
#   tools/backend-split/extract.sh --no-history [--out <dir>] [--no-verify] [--force]
#   tools/backend-split/extract.sh             [--out <dir>] [--no-verify] [--force]
#
# Modi:
#   --no-history   Snapshot: sauberer Inhalt ohne Git-Historie (empfohlen; braucht
#                  kein git-filter-repo). Optional anschließend `git init`.
#   (default)      Historie mitnehmen via `git filter-repo` (muss installiert sein):
#                  flacht packages/backend/ (inkl. Pre-Rename server/) auf die Wurzel.
#
# Optionen:
#   --out <dir>    Zielverzeichnis (Default: ./dist/backend-split).
#   --no-verify    Selbsttest (node --check, Boot, persistence, contract) überspringen.
#   --force        Nicht-leeres Zielverzeichnis überschreiben.
#   -h, --help     Diese Hilfe.
# =====================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TPL="${SCRIPT_DIR}/templates"

OUT="${REPO_ROOT}/dist/backend-split"
NO_HISTORY=0
VERIFY=1
FORCE=0
VERIFY_PORT="${BSG_EXTRACT_PORT:-3997}"

die() { echo "✗ $*" >&2; exit 1; }
log() { echo "» $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --no-history) NO_HISTORY=1 ;;
    --out) shift; OUT="${1:?--out braucht ein Verzeichnis}" ;;
    --out=*) OUT="${1#--out=}" ;;
    --no-verify) VERIFY=0 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unbekannte Option: $1 (--help)" ;;
  esac
  shift
done

# OUT zu absolutem Pfad machen.
mkdir -p "$(dirname "$OUT")"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

[ -d "${REPO_ROOT}/packages/backend" ]      || die "packages/backend/ nicht gefunden (falsches Repo?)"
[ -d "${REPO_ROOT}/packages/api-contract" ] || die "packages/api-contract/ nicht gefunden"

SRC_COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
GEN_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# -------------------------------------------------------------------
# materialize <destdir> : legt den Standalone-Tree an (modus-unabhängig).
# -------------------------------------------------------------------
materialize() {
  local dst="$1"
  log "Backend-Quellen -> ${dst}/ (flach)"
  for f in api.mjs index.mjs store.mjs persistence.mjs; do
    cp "${REPO_ROOT}/packages/backend/${f}" "${dst}/${f}"
  done

  log "Vertrag -> ${dst}/contract/"
  mkdir -p "${dst}/contract/data"
  cp "${REPO_ROOT}"/packages/api-contract/*.mjs "${dst}/contract/"
  cp "${REPO_ROOT}/packages/api-contract/README.md" "${dst}/contract/README.md"
  cp "${REPO_ROOT}"/packages/api-contract/data/*.json "${dst}/contract/data/"
  cp "${TPL}/mock-src.stub.js" "${dst}/contract/mock-src.stub.js"

  log "Scaffolding -> ${dst}/"
  mkdir -p "${dst}/tools" "${dst}/.github/workflows" "${dst}/data"
  cp "${TPL}/package.json"        "${dst}/package.json"
  cp "${TPL}/gitignore"           "${dst}/.gitignore"
  cp "${TPL}/vendor-seeds.mjs"    "${dst}/tools/vendor-seeds.mjs"
  cp "${TPL}/github-workflows/ci.yml" "${dst}/.github/workflows/ci.yml"
  sed -e "s/@SOURCE_COMMIT@/${SRC_COMMIT}/g" -e "s/@GENERATED_AT@/${GEN_AT}/g" \
    "${TPL}/README.md" > "${dst}/README.md"

  log "Seeds nach data/ vendoren (install-frei, pfadbasiert)"
  node "${dst}/tools/vendor-seeds.mjs" >/dev/null

  log "Seed-/Static-Pfade umschreiben (index.mjs, persistence.mjs)"
  node "${SCRIPT_DIR}/rewrite-paths.mjs" "${dst}"
}

# -------------------------------------------------------------------
# verify <destdir> : Selbsttest des erzeugten Backends.
# -------------------------------------------------------------------
verify() {
  local dst="$1" srv_pid="" rc=0
  log "Selbsttest: node --check"
  local f
  for f in "${dst}"/*.mjs "${dst}"/contract/*.mjs "${dst}"/tools/*.mjs; do
    node --check "$f"
  done

  log "Selbsttest: Seeds-Drift (data == contract/data)"
  node "${dst}/tools/vendor-seeds.mjs" --check >/dev/null

  log "Selbsttest: Persistenz-Roundtrip"
  node "${dst}/persistence.mjs" >/dev/null

  log "Selbsttest: Backend booten (:${VERIFY_PORT}) + Contract-Suite (Real)"
  PORT="${VERIFY_PORT}" node "${dst}/index.mjs" >/tmp/extract-verify-server.log 2>&1 &
  srv_pid=$!
  trap '[ -n "'"$srv_pid"'" ] && kill '"$srv_pid"' 2>/dev/null || true' RETURN
  local i ok=0
  for i in $(seq 1 60); do
    if curl -sf "http://localhost:${VERIFY_PORT}/api/age-classes" >/dev/null 2>&1; then ok=1; break; fi
    sleep 0.5
  done
  [ "$ok" = 1 ] || { cat /tmp/extract-verify-server.log >&2; kill "$srv_pid" 2>/dev/null || true; die "Backend nicht erreichbar"; }

  BSG_MOCK_SRC="${dst}/contract/mock-src.stub.js" \
  TEST_BASE="http://localhost:${VERIFY_PORT}" \
    node "${dst}/contract/run.mjs" | tail -3 || rc=$?
  kill "$srv_pid" 2>/dev/null || true
  trap - RETURN
  [ "$rc" = 0 ] || die "Contract-Suite fehlgeschlagen (Exit ${rc})"
  log "Selbsttest grün."
}

# -------------------------------------------------------------------
# Zielverzeichnis vorbereiten
# -------------------------------------------------------------------
if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null || true)" ]; then
  [ "$FORCE" = 1 ] || die "Zielverzeichnis ist nicht leer: ${OUT} (--force zum Überschreiben)"
  log "Leere Zielverzeichnis (--force): ${OUT}"
  # .git erhalten, falls vorhanden (für Push in ein existierendes Klon-Repo).
  find "$OUT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
fi
mkdir -p "$OUT"

# -------------------------------------------------------------------
# Modus
# -------------------------------------------------------------------
if [ "$NO_HISTORY" = 1 ]; then
  log "Modus: Snapshot (--no-history)"
  materialize "$OUT"
else
  log "Modus: Historie via git filter-repo"
  command -v git-filter-repo >/dev/null 2>&1 || command -v git >/dev/null 2>&1 && git filter-repo --help >/dev/null 2>&1 \
    || die "git-filter-repo nicht gefunden. Installiere es ODER nutze --no-history (Snapshot)."
  TMP="$(mktemp -d)"
  log "Klone Monorepo nach ${TMP} und filtere packages/backend/ (+ server/) auf die Wurzel"
  git clone --no-local "$REPO_ROOT" "$TMP" >/dev/null 2>&1
  ( cd "$TMP" && git filter-repo --force \
      --path packages/backend/ --path server/ \
      --path-rename packages/backend/: --path-rename server/: )
  # Historie-Tree übernehmen (ohne die alten backend-package.json/README, die wir ersetzen) ...
  rm -rf "${OUT:?}/.git"; mv "${TMP}/.git" "${OUT}/.git"
  ( cd "$OUT" && git checkout -- . 2>/dev/null || git reset --hard HEAD >/dev/null 2>&1 || true )
  rm -f "${OUT}/package.json" "${OUT}/README.md"
  rm -rf "$TMP"
  # ... dann das Standalone-Layout darüberlegen.
  materialize "$OUT"
fi

[ "$VERIFY" = 1 ] && verify "$OUT" || log "Selbsttest übersprungen (--no-verify)"

echo
log "Fertig: ${OUT}"
echo "  Inhalt:"
( cd "$OUT" && find . -maxdepth 2 -not -path './.git/*' -not -name .git | sort | sed 's/^/    /' )
cat <<EOF

Nächste Schritte (Push in das eigenständige Repo):
  1) In einen Klon von crypticalcode/vereins-baukasten-backend übernehmen
     (oder direkt mit --out <klon> erzeugen; .git bleibt erhalten).
  2) Branch anlegen, committen, pushen, Draft-PR öffnen.
EOF
