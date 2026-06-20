# Deployment (Hetzner: Beta + Release)

Diese Stufe ergänzt die **Draft**-Stufe (GitHub Pages, API-Modus `mock`). Beta und Release
laufen auf einem Hetzner-Server als jeweils **ein** Node-Prozess, der gleichzeitig die
statische Website **und** `/api/*` ausliefert (`server/index.mjs`, `BSG_STATIC=1`). Caddy
terminiert TLS und leitet pro Subdomain weiter.

| Stufe | Trigger | Dienst | Port | Domain | `BSG_DEV` |
|-------|---------|--------|------|--------|-----------|
| Beta  | Git-Tag `v*.*.*-beta.*` | `bsg-beta` | 8081 | `beta.<domain>` | `1` (devCode/reset, basicauth-geschützt) |
| Prod  | GitHub-Release / Tag `v*.*.*` | `bsg-prod` | 8080 | `<domain>`, `www` | `0` |

Der API-Default wird beim Deploy ins Artefakt injiziert (nicht im Git committet):

```bash
sed -i 's/mode: "mock",/mode: "real",/' assets/js/api-config.js   # same-origin, base ""
```

## Einmalige Server-Einrichtung

1. **Node ≥ 18 und Caddy installieren** (Distro-Paketquellen oder offizielle Repos).
2. **Deploy-User + Zielverzeichnisse**
   ```bash
   sudo useradd --system --create-home --shell /usr/sbin/nologin bsgdeploy
   sudo mkdir -p /var/www/bsg-beta /var/www/bsg-prod
   sudo chown -R bsgdeploy:bsgdeploy /var/www/bsg-beta /var/www/bsg-prod
   ```
3. **SSH-Key für CI**: ein dediziertes Schlüsselpaar erzeugen, den Public-Key in
   `~bsgdeploy/.ssh/authorized_keys` ablegen, den Private-Key als GitHub-Secret
   `HETZNER_SSH_KEY` hinterlegen (siehe unten).
4. **Sudo nur für Service-Restarts** (`/etc/sudoers.d/bsgdeploy`):
   ```
   bsgdeploy ALL=(root) NOPASSWD: /bin/systemctl restart bsg-beta, /bin/systemctl restart bsg-prod
   ```
5. **systemd-Units** aus diesem Verzeichnis installieren:
   ```bash
   sudo cp deploy/bsg-beta.service deploy/bsg-prod.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now bsg-beta bsg-prod
   ```
6. **Caddy** konfigurieren: `deploy/Caddyfile` nach `/etc/caddy/Caddyfile` kopieren,
   `<domain>` ersetzen, basicauth-Hash via `caddy hash-password` setzen, dann
   `sudo systemctl reload caddy`.
7. **DNS**: A/AAAA-Records für `<domain>`, `www.<domain>` und `beta.<domain>` auf den Server.

## GitHub Environments & Secrets

| Environment | Secrets |
|-------------|---------|
| `beta` | `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY`, `BETA_PATH` (z. B. `/var/www/bsg-beta`), `BETA_URL` (z. B. `https://beta.<domain>`), `BETA_BASICAUTH` (`user:pass` für die Smoke-Tests) |
| `production` | `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY`, `PROD_PATH`, `PROD_URL` |

Für `production` zusätzlich eine **Protection-Rule mit Required-Reviewer** (manuelle Freigabe)
setzen.

## Offene Vorbedingungen

- **E-Mail-Versand** ist im Backend noch nicht implementiert → echter passwortloser Login
  funktioniert in Prod (`BSG_DEV=0`) noch nicht. Beta nutzt deshalb `devCode` (`BSG_DEV=1`).
- **Persistenz**: Der Store ist In-Memory; Daten gehen bei Neustart/Deploy verloren. Eine
  DB-Anbindung in `api.mjs` (gleiche Routen) ist als Folge-Schritt vorgesehen.
