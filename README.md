# diplomatic-expression-docker

Clean-room Docker Desktop recreation of the Railway stack behind `diplomatic-expression`.

## What this repo contains

- `n8n` main app
- `n8n-worker-1` and `n8n-worker-2`
- `postgres` for the n8n database
- `redis` for queue mode
- `pgvector` for vector storage
- `mcp-server` for the n8n MCP API bridge

## What I preserved from the Railway layout

- Queue-based n8n execution
- Separate Postgres and Redis services
- Separate pgvector service
- Separate MCP server service
- Environment variable names that match the Railway setup where practical

## What I intentionally did not carry over

- No Railway settings
- No data migration
- No existing repo modifications
- No dependence on your current Railway deployment

## Architecture summary

This is a fresh local deployment, not a sync of the Railway project.

- `n8n` is the main workflow app
- `postgres` stores n8n data
- `redis` powers queue mode
- `pgvector` is kept as a separate service to mirror the Railway shape
- `n8n-worker-1` and `n8n-worker-2` process queued jobs
- `mcp-server` exposes a small API bridge into n8n

The setup is meant to be easy to run on Docker Desktop with no Railway account involved.

## Prerequisites

- Docker Desktop installed
- A local `.env` file based on `.env.example`
- An n8n API key for the MCP server

## First-time setup

1. Copy the example env file:

```bash
cp .env.example .env
```

2. Fill in the secrets in `.env`.

3. Start the stack:

```bash
docker compose up -d --build
```

Then open:

- n8n: `http://localhost:5678`
- MCP server health: `http://localhost:3000/health`
- MCP SSE endpoint: `http://localhost:3000/sse`

## What your friend must change

- `N8N_ENCRYPTION_KEY` should be a fresh random value for the new setup
- `N8N_JWT_SECRET` should also be unique
- `DB_POSTGRESDB_PASSWORD` and `PGVECTOR_PASSWORD` should not be left as placeholders
- `MCP_AUTH_TOKEN` should be treated like a private shared secret between the MCP server and n8n
- `N8N_API_KEY` must match the API key configured in the n8n instance

## Optional integrations

Leave these empty unless the workflows actually use them:

- Google OAuth
- OpenAI
- Perplexity
- Pinecone
- Supabase

## Quick validation

After the stack starts, check:

- `docker compose ps`
- `http://localhost:5678` for n8n
- `http://localhost:3000/health` for the MCP server

If n8n does not start cleanly, the first things to check are the `.env` secrets and whether Docker Desktop has enough memory allocated.

## Notes for your friend

- Change `N8N_ENCRYPTION_KEY` to a fresh secret for the new setup.
- Keep `WEBHOOK_URL` and `N8N_EDITOR_BASE_URL` pointed at the local machine unless you later move behind a reverse proxy.
- Fill the external integration keys only if the workflows need them.
- The project will run without Railway, but the workflows and credentials are still n8n data that must be configured inside the new instance.

## MCP server

The MCP server in this repo is a fresh implementation that exposes the same basic workflow operations:

- list workflows
- get workflow
- create workflow
- update workflow
- activate / deactivate workflow
- delete workflow
- list executions
- get execution

It talks to n8n using `N8N_BASE_URL` and `N8N_API_KEY`.
