#!/usr/bin/env bash
# Sync public web/calendar sources + login-gated TIS Times into Supabase.
# Intended for Railway cron (exits when done). Requires env vars from .env / Railway.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python -m tis_agent sync web
