#!/usr/bin/env sh
# =====================================================================
# configure-merge-drivers.sh – registriert den "ours"-Merge-Treiber.
# ---------------------------------------------------------------------
# .gitattributes markiert die repo-privaten Branding-Dateien mit merge=ours.
# Git fuehrt einen benannten Merge-Treiber aber nur aus, wenn er lokal in der
# Repo-Config registriert ist (Sicherheitsgrund: .gitattributes allein darf
# keinen Code/Behaviour aktivieren). Dieses Skript erledigt die einmalige
# Registrierung. Einmal pro Klon (und in CI vor cross-repo-Merges) ausfuehren:
#
#   sh tools/configure-merge-drivers.sh
#
# Der "true"-Treiber ist ein No-Op, der den Merge mit Exit 0 abschliesst und
# damit die bereits ausgecheckte (eigene) Version behaelt = "ours".
# Siehe docs/bidirectional-sync.md.
# =====================================================================
set -e
git config merge.ours.driver true
echo "merge.ours.driver = $(git config merge.ours.driver)  (Branding-Dateien werden bei Merges geschuetzt)"
