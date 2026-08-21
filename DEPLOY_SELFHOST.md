# Self-hosting ProCallingApp on your own server

Runs the **whole stack** (PostgreSQL + API + Web CRM) with Docker Compose. One
command brings it all up. Works on any Linux VPS with root SSH.

> **cPanel note:** *shared* cPanel hosting can't run Docker/Postgres/background Node.
> You need a **VPS** (root SSH) — e.g. Hostinger VPS, Contabo, DigitalOcean/AWS
> Lightsail (₹400–800 / $4–6 per month). If your cPanel is on a VPS with root, it works too.

---

## 1. Prerequisites
- A VPS running **Ubuntu 22.04/24.04** (or any Docker-capable Linux), with **root SSH**.
- Your server's **public IP** (e.g. `203.0.113.10`).
- (Optional) a domain/subdomain for HTTPS — you can add this later.

## 2. Install Docker (once, on the server)
```bash
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

## 3. Get the code
```bash
git clone https://github.com/RealtyHeadquarters/CallingApp.git
cd CallingApp
```

## 4. Configure
```bash
cp .env.selfhost.example .env.selfhost
nano .env.selfhost        # set POSTGRES_PASSWORD, JWT_SECRET, CORS_ORIGINS
```
- `JWT_SECRET` → `openssl rand -base64 48`
- `CORS_ORIGINS` → `http://YOUR_SERVER_IP` (add your domain later, comma-separated)

## 5A. Bring existing data over from Neon (recommended)
Keeps your live super admin + all tenants/users/calls.
```bash
docker compose --env-file .env.selfhost up -d db        # start Postgres only
NEON_URL='postgresql://neondb_owner:...@ep-...neon.tech/neondb?sslmode=require' \
  bash scripts/migrate-from-neon.sh                     # copies everything
docker compose --env-file .env.selfhost up -d --build   # start API + web
```

## 5B. …or start fresh (no migration)
```bash
docker compose --env-file .env.selfhost up -d --build
# create the first tenant + super admin:
docker compose --env-file .env.selfhost exec api node prisma/seed-tenant.mjs
# (note the printed super-admin email + password)
```

## 6. Open it
```
http://YOUR_SERVER_IP
```
Web CRM + API are both served on port 80 (nginx serves the app and proxies `/api`
to the backend). Log in as super admin → onboard clients.

Health check: `curl http://YOUR_SERVER_IP/health`

---

## Everyday operations
```bash
# View logs
docker compose --env-file .env.selfhost logs -f api

# Update to latest code
git pull
docker compose --env-file .env.selfhost up -d --build

# Stop / start
docker compose --env-file .env.selfhost down
docker compose --env-file .env.selfhost up -d

# DB backup (cron this daily)
docker compose --env-file .env.selfhost exec -T db \
  sh -c 'PGPASSWORD=$POSTGRES_PASSWORD pg_dump -U $POSTGRES_USER $POSTGRES_DB -Fc' > backup-$(date +%F).pgc
```

## Add a domain + free HTTPS (later)
When you have a domain pointed to the server IP, the easiest path is **Caddy** in
front (automatic Let's Encrypt certs). Point `api.yourco.com`/`app.yourco.com` at the
IP, then run a small Caddy container reverse-proxying to the `web` service on :80.
Update `CORS_ORIGINS` to `https://app.yourco.com` and rebuild. (Ask and I'll add a
ready-made `caddy` service to the compose file.)

## Firewall
```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```

## Mobile app
Point the Flutter app's API base to `http://YOUR_SERVER_IP/api` (or your domain) and
rebuild the APK. (Old builds keep hitting the Render URL until updated.)

---

## What runs where
| Container | Role | Port |
|-----------|------|------|
| `db` | PostgreSQL 16 (data in the `pgdata` volume) | internal only |
| `api` | Node/Express API; runs `prisma db push` + seeds plans on boot | internal `4000` |
| `web` | nginx: serves the React build + proxies `/api` → api | **80** (public) |

Your data lives in the Docker volume `pgdata` — it survives restarts/updates.
