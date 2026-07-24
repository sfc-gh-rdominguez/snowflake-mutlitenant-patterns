USE ROLE ACCOUNTADMIN;

-- Per-tenant objects (isolated model: one DB + warehouse per tenant)
DROP DATABASE IF EXISTS duff_db;
DROP DATABASE IF EXISTS krusty_db;
DROP WAREHOUSE IF EXISTS duff_wh;
DROP WAREHOUSE IF EXISTS krusty_wh;

DROP ROLE IF EXISTS tenant_duff_admin;
DROP ROLE IF EXISTS tenant_duff_viewer;
DROP ROLE IF EXISTS tenant_krusty_admin;
DROP ROLE IF EXISTS tenant_krusty_viewer;

DROP USER IF EXISTS tenant_duff_svc;
DROP USER IF EXISTS tenant_krusty_svc;

-- Admin/control-plane objects
DROP DATABASE IF EXISTS opt_admin_db;
DROP WAREHOUSE IF EXISTS opt_admin_wh;
DROP ROLE IF EXISTS opt_admin;

DROP SECURITY INTEGRATION IF EXISTS opt_keycloak;
