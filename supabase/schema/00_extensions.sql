-- Canonical Lumina schema source: schemas and extensions
-- Fresh owned backends only. This is a reviewed rebaseline, not recovered history.

CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS extensions;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET check_function_bodies = false;
