#!/usr/bin/env sh
# =====================================================================
# sync-merge.sh – branding-sicherer Merge zwischen Upstream und Verein-Fork.
# ---------------------------------------------------------------------
# Wrapper um `git merge`, der die repo-privaten Branding-Dateien (Allowlist in
# .gitattributes, merge=ours) IN BEIDE RICHTUNGEN schützt – egal welche Seite sie
# geändert hat.
#
#   sh tools/sync-merge.sh upstream/main        # Fork zieht Upstream
#   sh tools/sync-merge.sh fork/main            # Upstream übernimmt Fork-Beitrag
#
# Warum nicht `git merge` allein? Der merge=ours-Treiber greift NUR bei einem
# Konflikt (wenn BEIDE Seiten dieselbe Datei geändert haben). Hat nur die
# Gegenseite eine Branding-Datei geändert, nimmt Git sie ohne Konflikt an und
# würde das eigene Branding überschreiben. Dieser Wrapper merged zuerst (so löst
# merge=ours die Beidseitig-geändert-Fälle) und stellt danach ALLE merge=ours-
# Pfade aus dem eigenen HEAD wieder her (deckt die Nur-Gegenseite-Fälle ab).
# Branding-Dateien sind per Definition repo-privat und sollen keine
# Cross-Repo-Änderungen empfangen. Siehe docs/bidirectional-sync.md.
# =====================================================================
set -e

REF="${1:?Usage: sh tools/sync-merge.sh <ref-to-merge>}"

echo "==> git merge --no-commit --no-ff $REF"
set +e
git merge --no-commit --no-ff "$REF"
MERGE_STATUS=$?
set -e

# Die geschützten Pfade aus .gitattributes lesen (erste Spalte der merge=ours-Zeilen)
# – NACH dem Merge, damit auch in DIESEM Merge neu hinzugekommene Allowlist-Einträge
# greifen (sonst würde eine frisch ergänzte Branding-Datei einmalig durchrutschen).
# Konfliktmarker-Zeilen ignorieren. "<dir>/**" -> "<dir>" (Git-Pathspec).
PROTECTED=$(grep 'merge=ours' .gitattributes 2>/dev/null \
  | grep -vE '^[[:space:]]*#|^[<=>]{7}' \
  | awk '{ p=$1; sub(/\/\*\*$/, "", p); print p }')

echo "==> Branding-Dateien aus dem eigenen HEAD wiederherstellen (merge=ours-Allowlist):"
for p in $PROTECTED; do
  if git checkout HEAD -- "$p" 2>/dev/null; then
    git add -- "$p" 2>/dev/null || true
    echo "    geschützt: $p"
  fi
done

# Verbleibende (nicht-branding) Konflikte melden.
CONFLICTS=$(git diff --name-only --diff-filter=U || true)
echo ""
if [ -n "$CONFLICTS" ]; then
  echo "Es bleiben Konflikte in GETEILTEN Dateien – bitte manuell lösen, dann committen:"
  echo "$CONFLICTS" | sed 's/^/    /'
elif [ "$MERGE_STATUS" -eq 0 ]; then
  echo "Sauber. Branding ist geschützt. Bitte prüfen und committen:  git commit --no-edit"
else
  echo "Merge gestoppt – bitte Ergebnis prüfen und committen:  git commit --no-edit"
fi
echo "Tipp: danach ggf. Cache-Bust angleichen + node tools/guard-versions.mjs"
