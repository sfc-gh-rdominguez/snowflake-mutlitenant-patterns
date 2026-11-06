-- We'll create a namespace since there will be other demos, but this one's is
-- `mtt_db`, etc.
USE ROLE ACCOUNTADMIN;

CREATE DATABASE IF NOT EXISTS mtt_db;
GRANT OWNERSHIP ON DATABASE mtt_db TO ROLE mtt_admin COPY CURRENT GRANTS;

-- All tenants share the compute of `mtt_wh`; see the noisy-neighbor variation
-- for giving a heavy tenant its own.
CREATE WAREHOUSE IF NOT EXISTS mtt_wh
  WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;
GRANT USAGE ON WAREHOUSE mtt_wh TO ROLE mtt_admin;

-- Three schemas:
--   `base`     - the shared table, protected by policies attached to it.
--   `security` - entitlements and policies; the app role gets no grants here,
--                the policies read it with their owner's rights.
--   `serving`  - the semantic view and Cortex agent the app talks to.
USE ROLE mtt_admin;
CREATE SCHEMA IF NOT EXISTS mtt_db.base;
CREATE SCHEMA IF NOT EXISTS mtt_db.security;
CREATE SCHEMA IF NOT EXISTS mtt_db.serving;
