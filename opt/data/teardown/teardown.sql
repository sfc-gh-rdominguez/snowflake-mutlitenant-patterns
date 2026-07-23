USE ROLE ACCOUNTADMIN;

DROP ROLE IF EXISTS opt_admin;
DROP DATABASE IF EXISTS opt_db;
DROP WAREHOUSE IF EXISTS opt_wh;
DROP ROLE IF EXISTS tenant_duff_admin;
DROP ROLE IF EXISTS tenant_duff_viewer;
DROP ROLE IF EXISTS tenant_krusty_admin;
DROP ROLE IF EXISTS tenant_krusty_viewer;

DROP USER IF EXISTS tenant_duff_svc;
DROP USER IF EXISTS tenant_krusty_svc;

DROP SECURITY INTEGRATION IF EXISTS opt_keycloak;
