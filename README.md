# diplomatic-expression-docker

Docker Compose application stack consumed by
[`saai-zero-touch`](https://github.com/nbadadali/saai-zero-touch).

The supported deployment target is Docker Engine inside WSL2 Ubuntu 22.04.
Docker Desktop is not required.

## Services

- `postgres`: n8n application database
- `redis`: n8n queue broker
- `pgvector`: vector database
- `n8n`: main UI, API, webhooks, and database migrations
- `n8n-worker-1` and `n8n-worker-2`: queued execution workers
- `mcp-server`: authenticated MCP bridge to the n8n public API

All services use named volumes and `restart: unless-stopped`. The workers depend
on a healthy main n8n service, so a fresh database is migrated by the main
process before either worker starts.

## Recommended installation

Do not configure this repository manually for a standard SAAI laptop. Run the
host and WSL installers from `saai-zero-touch`:

1. Run `windows-setup.ps1 -WslDistro Ubuntu-22.04 -EnableBrowser` as Windows
   Administrator.
2. Open Ubuntu 22.04.
3. Configure and run `saai-zero-touch/deploy.sh`.

The deployment script clones this repository, generates persistent secrets,
creates `.env`, starts n8n in migration-safe stages, and installs autostart.

## Local endpoints

- n8n: `http://localhost:5678`
- MCP liveness: `http://localhost:3000/health`
- MCP readiness: `http://localhost:3000/ready`
- MCP SSE transport: `http://localhost:3000/sse`

Published ports bind to `127.0.0.1` by default. Set
`HOST_BIND_ADDRESS=0.0.0.0` only when remote network access is intentional and
protected by an appropriate firewall and authentication policy.

## First-run MCP configuration

The MCP container can start before an n8n API key exists. In that state:

- `/health` returns success because the MCP process is alive.
- `/ready` returns HTTP 503 with `configuration_required`.
- MCP tool calls cannot access n8n.

After creating the n8n owner account:

1. In n8n, open **Settings -> API** and create an API key.
2. Put the key in `saai-zero-touch/config.env` as `N8N_API_KEY="..."`.
3. Run:

```bash
cd ~/saai-deploy
./deploy.sh --only env_file
cd ~/diplomatic-expression-docker
docker compose up -d --force-recreate mcp-server
curl -fsS http://127.0.0.1:3000/ready
```

## Manual development startup

For development outside `saai-zero-touch`:

```bash
cp .env.example .env
# Replace every placeholder secret in .env before starting.
docker compose config
docker compose up -d --build
docker compose ps
```

The normal Compose dependency graph is migration-safe. The staged startup in
`deploy.sh` adds diagnostics and recovery behavior for unattended deployment.

## Version policy

`N8N_IMAGE_TAG` defaults to the tested `2.28.0` release. Production deployments
should pin an explicitly tested version in `.env`; do not use `latest`.

The MCP image installs dependencies from `package-lock.json` using `npm ci`.
Update and test the lock file intentionally when upgrading dependencies.

## Useful commands

```bash
docker compose ps
docker compose logs --tail 120 n8n
docker compose logs --tail 120 n8n-worker-1 n8n-worker-2
docker compose logs --tail 120 mcp-server
curl -fsS http://127.0.0.1:5678/healthz/readiness
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/ready
```

For the complete deployment health check, run:

```bash
bash ~/saai-deploy/healthcheck.sh
```
