#!/usr/bin/env bash
set -euo pipefail

cd /home/nishant/diplomatic-expression-docker

# Give Docker a short window to come up after WSL starts.
for _ in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker compose up -d