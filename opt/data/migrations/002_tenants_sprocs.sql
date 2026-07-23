USE ROLE ACCOUNTADMIN;
USE DATABASE opt_admin_db;
USE SCHEMA admin;

-- NOTE: Since these are repeated per tenant, we're using stored procedures to
-- autmoate this process and reduce the surface area for errors.

-- 1. Create the tenant's objects
CREATE OR REPLACE PROCEDURE create_tenant_db(tenant_name VARCHAR)
RETURNS VARCHAR NOT NULL
LANGUAGE SQL
AS
$$
BEGIN
  EXECUTE IMMEDIATE 'CREATE DATABASE IF NOT EXISTS ' || tenant_name || '_db';
  RETURN tenant_name || ' db created';
END;
$$
;

-- 2. Create the tenant's schemas
CREATE OR REPLACE PROCEDURE create_tenant_schemas(tenant_name VARCHAR)
RETURNS VARCHAR NOT NULL
LANGUAGE SQL
AS
$$
BEGIN
  EXECUTE IMMEDIATE 'CREATE SCHEMA IF NOT EXISTS ' || tenant_name || '_db.base';
  EXECUTE IMMEDIATE 'CREATE SCHEMA IF NOT EXISTS ' || tenant_name || '_db.serving';
  RETURN tenant_name || ' schemas created';
END;
$$
;

-- 3. Create the tenant's warehouse
CREATE OR REPLACE PROCEDURE create_tenant_wh(tenant_name VARCHAR)
RETURNS VARCHAR NOT NULL
LANGUAGE SQL
AS
$$
BEGIN
  EXECUTE IMMEDIATE 'CREATE WAREHOUSE IF NOT EXISTS ' || tenant_name || '_wh WITH WAREHOUSE_SIZE = "xsmall"';
  RETURN tenant_name || ' wh created';
END;
$$
;

-- 4. Create the tenant's roles
CREATE OR REPLACE PROCEDURE create_tenant_roles(tenant_name VARCHAR)
RETURNS VARCHAR NOT NULL
LANGUAGE SQL
AS
$$
BEGIN
  EXECUTE IMMEDIATE 'CREATE ROLE IF NOT EXISTS tenant_' || tenant_name || 'admin';
  EXECUTE IMMEDIATE 'CREATE ROLE IF NOT EXISTS tenant_' || tenant_name || 'viewer';
  RETURN tenant_name || ' roles created';
END;
$$
;

-- 5. Create the service principal for the tenant and grant roles
CREATE OR REPLACE PROCEDURE create_tenant_svc_principal(tenant_name VARCHAR)
RETURNS VARCHAR NOT NULL
LANGUAGE SQL
AS
$$
BEGIN
  EXECUTE IMMEDIATE 'CREATE USER IF NOT EXISTS tenant_' || tenant_name || '_svc   TYPE = SERVICE LOGIN_NAME = TENANT_' || tenant_name ||'_SVC
    DEFAULT_ROLE = tenant_'|| tenant_name ||'_viewer   DEFAULT_WAREHOUSE = ' || tenant_name ||'_wh DEFAULT_NAMESPACE = '|| tenant_name ||'_DB.SERVING';
  RETURN tenant_name || ' service principal created';
END;
$$
;

-- 6. Grant usage to the objects

CREATE OR REPLACE PROCEDURE grant_tenant_usage(tenant_name VARCHAR)
RETURNS VARCHAR NOT NULL
LANGUAGE SQL
AS
$$
BEGIN
  EXECUTE IMMEDIATE 'GRANT ROLE tenant_'|| tenant_name ||'admin,   tenant_'|| tenant_name ||'viewer   TO USER tenant_'|| tenant_name ||'_svc';
  RETURN tenant_name || ' service principal granted admin and viewer roles';
END;
$$
;
