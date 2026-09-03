# Deploying `map.jro.sg` on a new host

This deployment serves the application at **`https://map.jro.sg/`**. There is no `/map.html` route.

The frontend is a static Astro build served by Nginx. The multiplayer backend runs as a single, unprivileged Node.js container with SQLite storage and is reachable only through Nginx on host loopback port `3210`. Nginx Basic Auth is the application’s only public authentication boundary.

## 1. Prerequisites

- A Linux host with DNS for `map.jro.sg` pointing to it.
- Ports 80 and 443 reachable according to the host’s firewall/security-group policy. This guide does not alter firewall rules.
- Git.
- Node.js 22 and pnpm 10.34.5.
- Docker Engine with the Compose plugin, or a compatible Compose implementation.
- Nginx.
- Certbot.
- `htpasswd` (normally supplied by `apache2-utils` on Debian/Ubuntu).

A rootless container runtime can be used if its account can read the repository and `/srv/jetlag-map/backend.env`, write `/srv/jetlag-map/data`, and bind the loopback port. Do not grant a user access to a rootful Docker socket under the assumption that it is low privilege; that access is effectively root-equivalent.

## 2. Clone the deployment branch

```bash
git clone --branch feat/map-jro-sg-deployment \
  https://github.com/hermes-jro/JetLagHideAndSeek.git
cd JetLagHideAndSeek
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
```

## 3. Create backend storage and Web Push keys

The Compose file expects its state and environment under `/srv/jetlag-map`:

```bash
sudo install -d -m 0700 /srv/jetlag-map
sudo install -d -m 0700 -o 1000 -g 1000 /srv/jetlag-map/data
pnpm exec web-push generate-vapid-keys --json
sudo install -m 0600 deploy/backend.env.example /srv/jetlag-map/backend.env
sudoedit /srv/jetlag-map/backend.env
```

Replace every placeholder in `backend.env`. Keep these values:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3210
DATABASE_PATH=/data/game.db
```

Set the generated `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, plus a valid `mailto:` or HTTPS `VAPID_SUBJECT`. Never commit the completed environment file. Keep the same VAPID key pair across upgrades; replacing it invalidates existing browser push subscriptions.

The container process runs as UID/GID 1000, with a read-only root filesystem, all Linux capabilities dropped, `no-new-privileges`, 128 PIDs, 512 MiB RAM, and one CPU. One backend replica must own a given SQLite database.

## 4. Start the backend

From the repository root:

```bash
sudo docker compose build --pull backend
sudo docker compose up -d backend
sudo docker compose ps
curl --fail --silent http://127.0.0.1:3210/healthz
```

Expected health output includes:

```json
{ "status": "ok", "pushConfigured": true }
```

The published backend port is bound to `127.0.0.1`; do not expose port 3210 publicly.

## 5. Build and publish the frontend

The root-host deployment uses the normal build command:

```bash
pnpm build
sudo python3 deploy/deploy_frontend.py
```

The helper validates the build, publishes it atomically to `/var/www/map-app`, applies Nginx-readable permissions, and preserves older hashed `_astro` assets so already-open tabs do not break during an update.

Do **not** build with a `/map.html` entry path. The manifest, service-worker scope, QR links, notification links, and backend push URLs all target `/`.

## 6. Create the Basic Auth credential

Choose the username participants will use:

```bash
sudo htpasswd -c /etc/nginx/.htpasswd-map YOUR_USERNAME
sudo chmod 0640 /etc/nginx/.htpasswd-map
sudo chown root:www-data /etc/nginx/.htpasswd-map
```

Do not commit or paste the password into the repository. Every frontend asset, API request, photo, and Socket.IO connection is protected by the same Nginx authentication boundary.

## 7. Obtain the TLS certificate

Create the ACME webroot and enable the HTTP-only bootstrap configuration:

```bash
sudo install -d -m 0755 /var/www/letsencrypt/.well-known/acme-challenge
sudo install -m 0644 deploy/nginx/map.jro.sg-bootstrap.conf \
  /etc/nginx/sites-available/map.jro.sg
sudo ln -sfn /etc/nginx/sites-available/map.jro.sg \
  /etc/nginx/sites-enabled/map.jro.sg
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot \
  --webroot-path /var/www/letsencrypt \
  --domain map.jro.sg
```

Certbot requires public DNS and port 80 to reach this host. If that is blocked, fix DNS or the existing network policy rather than exposing the backend port.

## 8. Enable the production Nginx configuration

After the certificate exists:

```bash
sudo install -m 0644 deploy/nginx/map.jro.sg.conf \
  /etc/nginx/sites-available/map.jro.sg
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl is-active nginx
```

The supplied configuration:

- redirects HTTP to HTTPS;
- serves the app at `/`;
- returns 404 for unknown static paths rather than serving HTML;
- serves the network-only service worker with root scope;
- protects all routes with Basic Auth;
- proxies `/api/` and `/socket.io/` to `127.0.0.1:3210`;
- allows up to 11 MiB for photo-upload multipart overhead.

## 9. Verify the deployment

Without credentials, the public boundary should reject access:

```bash
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  https://map.jro.sg/
```

Expected: `401`.

With credentials:

```bash
curl --user 'YOUR_USERNAME:YOUR_PASSWORD' --fail --head \
  https://map.jro.sg/
curl --user 'YOUR_USERNAME:YOUR_PASSWORD' --fail \
  https://map.jro.sg/api/vapid-public-key
curl --user 'YOUR_USERNAME:YOUR_PASSWORD' --fail \
  'https://map.jro.sg/socket.io/?EIO=4&transport=polling'
```

Also verify in a real browser:

1. Basic Auth appears before the application.
2. The map loads at `https://map.jro.sg/`.
3. Creating and joining a six-character game works in two browser sessions.
4. QR links target `https://map.jro.sg/?game=CODE`.
5. Notifications can be enabled and received over HTTPS.
6. A photo answer uploads and renders.
7. Refreshing always retrieves the current network build; there is no offline application cache.

## 10. Updating the deployment

```bash
cd JetLagHideAndSeek
git fetch origin
git switch feat/map-jro-sg-deployment
git pull --ff-only
pnpm install --frozen-lockfile
pnpm vitest run --maxWorkers=1 --minWorkers=1
pnpm build
sudo docker compose build backend
sudo docker compose up -d backend
sudo python3 deploy/deploy_frontend.py
curl --fail --silent http://127.0.0.1:3210/healthz
```

Reload Nginx only when its configuration changed, and always run `sudo nginx -t` first.

## 11. Backup and restore

Back up the SQLite database and sanitized photo directory together while the backend is stopped or from a consistent filesystem snapshot:

```bash
sudo docker compose stop backend
sudo tar -C /srv/jetlag-map -czf jetlag-map-backup.tar.gz data
sudo docker compose start backend
```

To restore on a replacement host, stop the backend, restore `data/game.db` and `data/uploads/` under `/srv/jetlag-map/data`, ensure UID/GID 1000 can write them, and then start the backend. Preserve `/srv/jetlag-map/backend.env` separately with mode `0600`.
