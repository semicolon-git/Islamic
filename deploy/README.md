# Deploying to your own server

This puts the whole platform on one Linux server. Three containers run under Docker Compose:

| Container | What it is |
|---|---|
| **app** | The Next.js app. It applies database migrations, and on first boot it seeds the Quran (KFGQPC Hafs), the hadith and the demo data. |
| **db** | Postgres 16, kept on a persistent volume. |
| **caddy** | Automatic HTTPS from Let's Encrypt. Phones need HTTPS to use the camera and to install the app. |

## Requirements
- **Operating system:** Ubuntu 22.04 or 24.04, or Debian 12. Use a clean server.
- **Size:** 2 vCPU, 4 GB RAM and 20 GB disk. A server with 2 GB RAM works: the script adds swap automatically.
- **Network:** ports **80** and **443** open in your cloud firewall or security group.
- **Domain (optional):** for example `signs.example.com`, with its DNS **A record pointing at the server's IP**. Without a domain you get `https://<ip-with-dashes>.sslip.io`.

## Install: one command
SSH into the server and run:

```bash
curl -fsSL https://raw.githubusercontent.com/semicolon-git/Islamic/main/deploy/install.sh | sudo bash -s -- signs.example.com
```

Leave off the domain to use the `sslip.io` address. The script:
1. installs Docker;
2. clones the repo to `/opt/signs-around-you` and downloads the pinned Quran, hadith and translation sources;
3. writes `deploy/.env` with fresh random secrets;
4. builds and starts everything;
5. waits until the app is healthy, then prints the URLs.

The first run takes about 5–10 minutes.

- **Visitor app:** `https://<your domain>`
- **Portal:** `https://<your domain>/portal`. Choose a persona and enter PIN **1448**; you can change it in `deploy/.env`.

## Everyday commands
All of these run from `/opt/signs-around-you`:

```bash
C="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
$C ps                       # status
$C logs -f app              # app logs
$C restart app              # restart after editing deploy/.env
sudo bash deploy/install.sh # update to the latest code (keeps data and secrets)
```

**Switch on AI:** put your key in `deploy/.env` as `ANTHROPIC_API_KEY=...`, then run `$C up -d app`. Check it with `$C exec app npx tsx scripts/ai-check.ts`.
If the check says the key "is not scoped to a workspace", also set `ANTHROPIC_WORKSPACE_ID=wrkspc_...` (Claude Console → Settings → Workspaces), or create the key inside a workspace instead.

**Reset the demo data** (wipes the database and re-seeds it on start):
```bash
$C down && docker volume rm signs_db && $C up -d
```

**Back up and restore:**
```bash
$C exec -T db pg_dump -U signs signs | gzip > backup-$(date +%F).sql.gz
gunzip -c backup-YYYY-MM-DD.sql.gz | $C exec -T db psql -U signs signs
```

## Troubleshooting
First run the doctor, and send its output when asking for help:
```bash
curl -fsSL https://raw.githubusercontent.com/semicolon-git/Islamic/main/deploy/doctor.sh | sudo bash
```

- **No HTTPS certificate:**
  - Check that ports 80 and 443 are reachable from the internet, and that the domain's A record points at this server.
  - Then check Caddy's logs: `$C logs caddy`.
- **The build stops with "Killed":** the server ran out of memory. Add swap, or use a 4 GB server, then re-run the install.
- **Concept images missing:** the build copies them from the image CDN. If that failed, the app loads them from the CDN in the browser instead.
