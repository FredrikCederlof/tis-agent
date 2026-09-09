#!/usr/bin/env bash
# Sync public web/calendar sources + login-gated TIS Times into Supabase.
# Intended for the nightly Drive Cloud Agent or a local run (exits when done).
# Requires env vars from .env / Cloud Agent secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python -m tis_agent sync web
