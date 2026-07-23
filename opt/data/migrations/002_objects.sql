-- We'll create a namespace since there will be other demos, but this one's is
-- `opt_db`, etc.` 
USE ROLE ACCOUNTADMIN;

CREATE DATABASE IF NOT EXISTS opt_db;
GRANT OWNERSHIP ON DATABASE opt_db TO ROLE opt_admin COPY CURRENT GRANTS;

CREATE WAREHOUSE IF NOT EXISTS opt_wh
  WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;
GRANT USAGE ON WAREHOUSE opt_wh TO ROLE opt_admin;

-- Additionally, there's two schemas: `base`, which is the
-- raw tables and entitlements; `serving` which is the secure views by which we
-- actually make content visible to the end users...more on that in the walkthrough.
USE ROLE opt_admin;
CREATE SCHEMA IF NOT EXISTS opt_db.base;
CREATE SCHEMA IF NOT EXISTS opt_db.serving;
