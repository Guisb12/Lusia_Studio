#!/bin/bash
set -e

# Start API server in foreground
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
