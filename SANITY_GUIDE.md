# n8n Stack Sanity Guide

Use the platform health check first:

```bash
bash ~/saai-deploy/healthcheck.sh
```

## Host checks

```bash
uptime
free -h
df -h /
systemctl is-active docker
systemctl --user is-active openclaw-gateway
```

## Container checks

```bash
cd ~/diplomatic-expression-docker
docker compose ps
```

Expected after startup:

- `postgres`, `redis`, `pgvector`, `n8n`, both workers, and `mcp-server` are
  running and healthy.
- n8n logs show the editor is accessible.
- worker logs show the workers are ready.

## Endpoint checks

```bash
curl -fsS http://127.0.0.1:5678/healthz/readiness
curl -fsS http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/ready
```

`/health` tests only whether the MCP process is alive. Before the first n8n API
key is configured, `/ready` intentionally returns HTTP 503 with
`configuration_required`. After the key is configured it must return HTTP 200.

## Logs

```bash
docker compose logs --tail 120 n8n
docker compose logs --tail 120 n8n-worker-1 n8n-worker-2
docker compose logs --tail 120 postgres redis pgvector
docker compose logs --tail 120 mcp-server
```

Investigate repeated occurrences of:

- `constraint already exists` during migrations
- `EAI_AGAIN`, database connection failures, or Redis connection failures
- container restart loops
- `out of memory`, `OOM`, or killed processes
- MCP authentication or n8n API-key rejection errors

## Recovery

The Compose dependency graph starts workers only after the main n8n service is
healthy. Normal recovery is therefore:

```bash
cd ~/diplomatic-expression-docker
docker compose up -d
```

For an unsuccessful deployment, use the phase named in the error output. For
example:

```bash
cd ~/saai-deploy
./deploy.sh --from stack
```

Do not delete named volumes unless permanent data loss is intended.

## Autostart

Linux autostart is owned by `saai-zero-touch/deploy.sh`:

- `openclaw-gateway.service`: OpenClaw gateway user service
- `n8n-stack.service`: Compose stack user service
- `~/.local/bin/saai-autostart.sh`: path-independent stack launcher
- `~/.saai-repo-path`: current application repository location

Windows only wakes WSL after logon through the
`OpenClaw-Stack-DelayedStart` Scheduled Task. Browser automation is restored by
the separate `OpenClaw-CDP-Autostart` task.

Check autostart with:

```bash
systemctl --user status n8n-stack.service
journalctl --user -u n8n-stack.service --no-pager -n 100
tail -n 100 ~/wsl-autostart.log
```

On Windows PowerShell:

```powershell
Get-ScheduledTask -TaskName 'OpenClaw-*'
Get-Content "$env:LOCALAPPDATA\OpenClaw\openclaw-stack.log" -Tail 100
Get-Content "$env:LOCALAPPDATA\OpenClaw\openclaw-cdp.log" -Tail 100
```
