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
  EXECUTE IMMEDIATE 'CREATE ROLE IF NOT EXISTS tenant_' || tenant_name || '_admin';
  EXECUTE IMMEDIATE 'CREATE ROLE IF NOT EXISTS tenant_' || tenant_name || '_viewer';
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

-- 6. Seed the tenant's data (isolated: everything lives in the tenant's own DB)
CREATE OR REPLACE PROCEDURE create_tenant_data(tenant_name VARCHAR)
RETURNS VARCHAR NOT NULL
LANGUAGE SQL
AS
$$
BEGIN
  -- Raw table holds only this tenant's rows; the DB itself is the isolation boundary.
  EXECUTE IMMEDIATE 'CREATE OR REPLACE TABLE ' || tenant_name || '_db.base.sales (
    tenant_id STRING, sale_id NUMBER, sale_ts TIMESTAMP_NTZ,
    region STRING, product STRING, quantity NUMBER, amount NUMBER(12, 2)
  ) CLUSTER BY (sale_ts)';

  EXECUTE IMMEDIATE 'INSERT INTO ' || tenant_name || '_db.base.sales
  SELECT
    ''' || tenant_name || '''                                                       AS tenant_id,
    seq8()                                                                          AS sale_id,
    DATEADD(''second'', UNIFORM(0, 60*60*24*365, RANDOM()), ''2024-01-01''::TIMESTAMP_NTZ) AS sale_ts,
    GET(ARRAY_CONSTRUCT(''NA'',''EMEA'',''APAC'',''LATAM''), UNIFORM(0,3,RANDOM()))::STRING AS region,
    GET(ARRAY_CONSTRUCT(''Widget'',''Gadget'',''Gizmo'',''Doohickey'',''Sprocket''),
        UNIFORM(0,4,RANDOM()))::STRING                                             AS product,
    UNIFORM(1,100,RANDOM())                                                        AS quantity,
    ROUND(UNIFORM(500,50000,RANDOM())/100.0, 2)                                    AS amount
  FROM TABLE(GENERATOR(ROWCOUNT => 200000))';

  -- Column masking is the admin/viewer differentiator: viewers see NULL for amount.
  EXECUTE IMMEDIATE 'CREATE OR REPLACE MASKING POLICY ' || tenant_name || '_db.base.mask_amount AS (val NUMBER) RETURNS NUMBER ->
    CASE WHEN ENDSWITH(CURRENT_ROLE(), ''_ADMIN'') THEN val ELSE NULL END';
  EXECUTE IMMEDIATE 'ALTER TABLE ' || tenant_name || '_db.base.sales MODIFY COLUMN amount SET MASKING POLICY ' || tenant_name || '_db.base.mask_amount';

  -- Secure view is what tenant roles are allowed to read (never base directly).
  EXECUTE IMMEDIATE 'CREATE OR REPLACE SECURE VIEW ' || tenant_name || '_db.serving.sales AS
    SELECT tenant_id, sale_id, sale_ts, region, product, quantity, amount
    FROM ' || tenant_name || '_db.base.sales';

  RETURN tenant_name || ' data seeded';
END;
$$
;

-- 7. Grant usage to the objects
CREATE OR REPLACE PROCEDURE grant_tenant_usage(tenant_name VARCHAR)
RETURNS VARCHAR NOT NULL
LANGUAGE SQL
AS
$$
BEGIN
  -- Both roles belong to the tenant's single service user.
  EXECUTE IMMEDIATE 'GRANT ROLE tenant_' || tenant_name || '_admin, tenant_' || tenant_name || '_viewer TO USER tenant_' || tenant_name || '_svc';

  -- Each role gets identical access to the serving view + warehouse; never to base.
  -- admin vs viewer differ only via the masking policy on amount.
  EXECUTE IMMEDIATE 'GRANT USAGE ON DATABASE ' || tenant_name || '_db TO ROLE tenant_' || tenant_name || '_admin';
  EXECUTE IMMEDIATE 'GRANT USAGE ON SCHEMA ' || tenant_name || '_db.serving TO ROLE tenant_' || tenant_name || '_admin';
  EXECUTE IMMEDIATE 'GRANT SELECT ON VIEW ' || tenant_name || '_db.serving.sales TO ROLE tenant_' || tenant_name || '_admin';
  EXECUTE IMMEDIATE 'GRANT USAGE ON WAREHOUSE ' || tenant_name || '_wh TO ROLE tenant_' || tenant_name || '_admin';

  EXECUTE IMMEDIATE 'GRANT USAGE ON DATABASE ' || tenant_name || '_db TO ROLE tenant_' || tenant_name || '_viewer';
  EXECUTE IMMEDIATE 'GRANT USAGE ON SCHEMA ' || tenant_name || '_db.serving TO ROLE tenant_' || tenant_name || '_viewer';
  EXECUTE IMMEDIATE 'GRANT SELECT ON VIEW ' || tenant_name || '_db.serving.sales TO ROLE tenant_' || tenant_name || '_viewer';
  EXECUTE IMMEDIATE 'GRANT USAGE ON WAREHOUSE ' || tenant_name || '_wh TO ROLE tenant_' || tenant_name || '_viewer';

  RETURN tenant_name || ' roles granted to service user + serving/warehouse usage';
END;
$$
;
