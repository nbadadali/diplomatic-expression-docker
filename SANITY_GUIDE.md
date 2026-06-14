# n8n Stack Sanity Guide

Use this after a restart or when you want to confirm the stack is healthy.

## 1. Check the host first

These checks tell you whether WSL2 itself is healthy before you blame n8n.

```bash
uptime
free -h
df -h /
```

Good signs:

- load average is not stuck high for a long time
- there is still a reasonable amount of `MemAvailable`
- the root filesystem is not close to full

If you want a deeper host check, look for kernel memory pressure:

```bash
journalctl -k --since '12 hours ago' | grep -Ei 'page allocation failure|out of memory|killed process|oom'
```

If that prints nothing, WSL2 did not hit an obvious memory crisis recently.

## 2. Check containers

```bash
cd ~/diplomatic-expression-docker
docker compose ps
```

Expected:

- `postgres`, `redis`, and `pgvector` should be `healthy`
- `n8n`, `n8n-worker-1`, `n8n-worker-2`, and `mcp-server` should be `Up`

## 3. Check service logs

Primary n8n:

```bash
docker compose logs --tail 60 n8n
```

Workers:

```bash
docker compose logs --tail 60 n8n-worker-1
docker compose logs --tail 60 n8n-worker-2
```

Redis:

```bash
docker compose logs --tail 60 redis
```

Postgres:

```bash
docker compose logs --tail 60 postgres
```

Healthy signs to look for:

- n8n should finish migrations and print `Editor is now accessible via: http://localhost:5678`
- workers should print `n8n worker is now ready`
- Redis should print `Ready to accept connections`
- Postgres should print `database system is ready to accept connections`
- a few warnings are acceptable if they are not repeated constantly
- the main things to watch for are `timeout`, `failed`, `EAI_AGAIN`, and `OOM`

## 4. Check the web UI

Open:

- `http://localhost:5678`

If the page loads, n8n is reachable.

## 5. Check the MCP server

```bash
curl -fsS http://localhost:3000/health
```

Expected response:

```json
{"ok":true}
```

## 6. Test a workflow webhook

If you created a webhook workflow at `/webhook/test`, verify it with:

```bash
curl -i -m 30 http://localhost:5678/webhook/test
```

If the workflow is configured for `GET`, the response should be `200 OK`.

If you see a `POST` error, the webhook is probably not configured for `POST`.

## 7. Confirm execution logs

After calling the webhook, check:

```bash
docker compose logs --tail 80 n8n | grep -E 'Execution [0-9]+|Enqueued execution'
docker compose logs --tail 80 n8n-worker-1 | grep -E 'Worker started execution|Worker finished execution'
docker compose logs --tail 80 n8n-worker-2 | grep -E 'Worker started execution|Worker finished execution'
```

What you want to see:

- the main n8n container enqueues an execution
- one of the workers starts and finishes that execution
- the workflow output appears in the n8n execution history in the UI

## 8. 24x7 watchdog checklist

Run this when you want a quick daily sanity pass:

```bash
cd ~/diplomatic-expression-docker
uptime
free -h
docker compose ps
docker compose logs --tail 50 n8n | grep -Ei 'timeout|failed|EAI_AGAIN|recovered|Execution|Enqueued'
docker compose logs --tail 50 n8n-worker-1 | grep -Ei 'Worker started execution|Worker finished execution|timeout|failed'
docker compose logs --tail 50 n8n-worker-2 | grep -Ei 'Worker started execution|Worker finished execution|timeout|failed'
docker compose logs --tail 50 postgres | grep -Ei 'ready to accept connections|checkpoint|fatal|panic|error'
docker compose logs --tail 50 redis | grep -Ei 'Ready to accept connections|error|warning'
journalctl -k --since '12 hours ago' | grep -Ei 'page allocation failure|out of memory|killed process|oom'
```

What is normal:

- occasional startup warnings
- a checkpoint every so often in Postgres logs
- one-off `Database connection recovered` messages if the host was briefly busy

What is not normal:

- repeated `page allocation failure` lines in the kernel log
- repeated `getaddrinfo EAI_AGAIN postgres`
- containers restarting
- swap staying nearly full for long periods

## 9. Recommended WSL2 tuning

If you want the easiest stability win, add a Windows-side file at `%UserProfile%\\.wslconfig` with something like this:

```ini
[wsl2]
memory=6GB
swap=4GB
localhostForwarding=true
pageReporting=true
autoMemoryReclaim=gradual
```

Then run `wsl --shutdown` from Windows and start WSL again so the new limits apply.

## 10. If something is off

- If a container is missing, run `docker compose up -d`
- If n8n is not reachable, check `docker compose logs --tail 120 n8n`
- If workers show `Command "n8n" not found`, make sure the compose file uses `command: ["worker"]`
- If the webhook hangs, make sure the workflow is active and the HTTP method matches the webhook trigger
- If WSL2 is showing memory pressure, raise the `memory` and `swap` values in `.wslconfig`

## 11. Windows logon autostart

I also added a helper script:

```bash
/home/nishant/diplomatic-expression-docker/scripts/wsl-autostart.sh
```

Windows autostart is wired through the user Startup folder:

- `%LOCALAPPDATA%\OpenClaw\wsl-autostart.cmd`
- `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\OpenClaw-n8n-autostart.cmd`

That launcher calls the WSL helper through `wsl.exe`. If you want to check it manually after login, run:

```bash
docker compose -f ~/diplomatic-expression-docker/docker-compose.yml ps
```

If the task works, the stack should be up a short time after you sign in to Windows.