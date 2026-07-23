--NOTE: In a real-world scenario, we wouldn't store these "default" tenants in a
--migration. Instead, we'd have a script that would call the stored procedures
--from 002_tenants_sprocs.sql. We're taking a shortcut here for simplicity.

USE ROLE ACCOUNTADMIN;
USE DATABASE opt_admin_db;
USE SCHEMA admin;
USE WAREHOUSE opt_admin_wh;

-- 1. Add the demo tenants

CALL create_tenant_db('duff');
CALL create_tenant_schemas('duff');
CALL create_tenant_wh('duff');
CALL create_tenant_roles('duff');
CALL create_tenant_svc_principal('duff');
CALL grant_tenant_usage('duff');
