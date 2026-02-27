#!/bin/bash
set -e

# Start ARQ worker in background
arq app.pipeline.worker.WorkerSettings &

# Start API server in foreground (keeps container alive)
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
