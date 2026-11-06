USE ROLE ACCOUNTADMIN;

-- One role and one service user for the whole app, created once. Adding a
-- tenant never touches this file -- it's a row in security.entitlements.
CREATE ROLE IF NOT EXISTS mtt_app_role;
GRANT ROLE mtt_app_role TO ROLE mtt_admin;

-- Key-pair only (no password). You set the public key yourself with
-- `just set-key`; mtt_admin gets just enough privilege to do that.
CREATE USER IF NOT EXISTS mtt_app_svc
  TYPE = SERVICE LOGIN_NAME = 'MTT_APP_SVC'
  DEFAULT_ROLE = mtt_app_role DEFAULT_SECONDARY_ROLES = ()
  DEFAULT_WAREHOUSE = mtt_wh DEFAULT_NAMESPACE = 'MTT_DB.SERVING';
GRANT ROLE mtt_app_role TO USER mtt_app_svc;
GRANT MODIFY PROGRAMMATIC AUTHENTICATION METHODS ON USER mtt_app_svc TO ROLE mtt_admin;

GRANT USAGE ON WAREHOUSE mtt_wh TO ROLE mtt_app_role;

-- The app role reads base.sales directly; the attached policies filter and mask
-- it on every path, including SQL the agent writes. Nothing on `security`.
USE ROLE mtt_admin;
GRANT USAGE ON DATABASE mtt_db TO ROLE mtt_app_role;
GRANT USAGE ON SCHEMA mtt_db.base TO ROLE mtt_app_role;
GRANT USAGE ON SCHEMA mtt_db.serving TO ROLE mtt_app_role;
GRANT SELECT ON TABLE mtt_db.base.sales TO ROLE mtt_app_role;
