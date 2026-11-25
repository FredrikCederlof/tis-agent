"""Removed staff must not be able to restore their own admin access.

The live update policy froze `role` and left `status` writable. This test
builds that policy, shows a deactivated admin can set status back to active,
then applies sql/032_lock_profile_privileges.sql and shows the same update
is rejected while a name change and a service-role deactivation still work.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "sql" / "032_lock_profile_privileges.sql"

pytestmark = pytest.mark.skipif(shutil.which("psql") is None, reason="psql is not installed")


def _psql(sql: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1", "-q"],
        input=sql,
        text=True,
        capture_output=True,
        check=False,
        env={**os.environ, "PGUSER": os.environ.get("PGUSER", "postgres")},
    )


def test_deactivated_user_cannot_restore_own_access() -> None:
    db = "tis_profile_priv_test"
    setup = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-q", "-c", f"DROP DATABASE IF EXISTS {db};"],
        text=True,
        capture_output=True,
        check=False,
    )
    assert setup.returncode == 0, setup.stderr
    created = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-q", "-c", f"CREATE DATABASE {db};"],
        text=True,
        capture_output=True,
        check=False,
    )
    assert created.returncode == 0, created.stderr

    script = f"""
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOINHERIT BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '');
$$;

CREATE TABLE public.admin_profiles (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  deactivated_at timestamptz,
  deactivated_by uuid
);

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_profiles_update_own ON public.admin_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND role = (SELECT p.role FROM public.admin_profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY admin_profiles_select_own ON public.admin_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.admin_profiles TO authenticated, service_role;

INSERT INTO public.admin_profiles (user_id, email, role, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'removed@example.com', 'admin', 'deactivated'),
  ('22222222-2222-2222-2222-222222222222', 'keeper@example.com', 'admin', 'active');

-- Before the lock: the removed admin's own token reactivates the row.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
UPDATE public.admin_profiles
SET status = 'active', deactivated_at = NULL
WHERE user_id = '11111111-1111-1111-1111-111111111111';
RESET ROLE;

DO $$
DECLARE
  got text;
BEGIN
  SELECT status INTO got
  FROM public.admin_profiles
  WHERE user_id = '11111111-1111-1111-1111-111111111111';
  IF got IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'expected the old policy to allow self-reactivation, got %', got;
  END IF;
END $$;

UPDATE public.admin_profiles
SET status = 'deactivated', deactivated_at = now()
WHERE user_id = '11111111-1111-1111-1111-111111111111';

\\i {MIGRATION}

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);

DO $$
BEGIN
  UPDATE public.admin_profiles
  SET status = 'active', deactivated_at = NULL
  WHERE user_id = '11111111-1111-1111-1111-111111111111';
  RAISE EXCEPTION 'self-reactivation should have been rejected';
EXCEPTION
  WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%cannot be changed from this session%' THEN
      RAISE;
    END IF;
END $$;

DO $$
BEGIN
  UPDATE public.admin_profiles
  SET role = 'member'
  WHERE user_id = '11111111-1111-1111-1111-111111111111';
  RAISE EXCEPTION 'self role change should have been rejected';
EXCEPTION
  WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%cannot be changed from this session%' THEN
      RAISE;
    END IF;
END $$;

UPDATE public.admin_profiles
SET first_name = 'Still'
WHERE user_id = '11111111-1111-1111-1111-111111111111';
RESET ROLE;

DO $$
DECLARE
  got_status text;
  got_name text;
BEGIN
  SELECT status, first_name INTO got_status, got_name
  FROM public.admin_profiles
  WHERE user_id = '11111111-1111-1111-1111-111111111111';
  IF got_status IS DISTINCT FROM 'deactivated' THEN
    RAISE EXCEPTION 'status changed to %', got_status;
  END IF;
  IF got_name IS DISTINCT FROM 'Still' THEN
    RAISE EXCEPTION 'name update did not apply, got %', got_name;
  END IF;
END $$;

-- Tina Admin deactivates through the service role.
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
UPDATE public.admin_profiles
SET status = 'deactivated', deactivated_at = now(), deactivated_by = '22222222-2222-2222-2222-222222222222'
WHERE user_id = '22222222-2222-2222-2222-222222222222';
RESET ROLE;

DO $$
DECLARE
  got text;
BEGIN
  SELECT status INTO got
  FROM public.admin_profiles
  WHERE user_id = '22222222-2222-2222-2222-222222222222';
  IF got IS DISTINCT FROM 'deactivated' THEN
    RAISE EXCEPTION 'service role should still deactivate, got %', got;
  END IF;
END $$;
"""
    result = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", db],
        input=script,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
