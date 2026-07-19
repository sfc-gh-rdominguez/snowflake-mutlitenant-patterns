-- We'll create a namespace since there will be other demos, but this one's is
-- `mtt_db`, etc.` 
USE ROLE ACCOUNTADMIN;

CREATE DATABASE IF NOT EXISTS mtt_db;
GRANT OWNERSHIP ON DATABASE mtt_db TO ROLE mtt_admin COPY CURRENT GRANTS;


-- All the tenants in this basic version will share the compute
-- of the `mtt_wh`...this will eventually introduce noisy-neighbor issues
-- wherein one tenant is being a real PITA and hogging compute. How could we
-- deal with this? Create a dedicated WH just for them. Probably just put that 
-- in the walkthrough. 
CREATE WAREHOUSE IF NOT EXISTS mtt_wh
  WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;
GRANT USAGE ON WAREHOUSE mtt_wh TO ROLE mtt_admin;

-- Additionally, there's two schemas: `base`, which is the
-- raw tables and entitlements; `serving` which is the secure views by which we
-- actually make content visible to the end users...more on that in the walkthrough.
USE ROLE mtt_admin;
CREATE SCHEMA IF NOT EXISTS mtt_db.base;
CREATE SCHEMA IF NOT EXISTS mtt_db.serving;
