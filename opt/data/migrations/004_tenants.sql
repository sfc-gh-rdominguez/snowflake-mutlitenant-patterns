USE ROLE ACCOUNTADMIN;
USE WAREHOUSE opt_wh;

-- We'll create a grant block for each role (admin/viewer per tenant) on the
-- serving schema and warehouse, but never on the base schema.
CREATE ROLE IF NOT EXISTS tenant_duff_admin;
CREATE ROLE IF NOT EXISTS tenant_duff_viewer;
CREATE ROLE IF NOT EXISTS tenant_krusty_admin;
CREATE ROLE IF NOT EXISTS tenant_krusty_viewer;

-- We'll create one service user (principal) per tenant, holding both of its roles. 
-- The OAuth scope selects the active role per request; DEFAULT_ROLE is 
-- least-privilege.
CREATE USER IF NOT EXISTS tenant_duff_svc   TYPE = SERVICE LOGIN_NAME = 'TENANT_DUFF_SVC'
  DEFAULT_ROLE = tenant_duff_viewer   DEFAULT_WAREHOUSE = opt_wh DEFAULT_NAMESPACE = 'MTT_DB.SERVING';
CREATE USER IF NOT EXISTS tenant_krusty_svc TYPE = SERVICE LOGIN_NAME = 'TENANT_KRUSTY_SVC'
  DEFAULT_ROLE = tenant_krusty_viewer DEFAULT_WAREHOUSE = opt_wh DEFAULT_NAMESPACE = 'MTT_DB.SERVING';

-- We'll then grant the admin and viewer roles to the service principal
GRANT ROLE tenant_duff_admin,   tenant_duff_viewer   TO USER tenant_duff_svc;
GRANT ROLE tenant_krusty_admin, tenant_krusty_viewer TO USER tenant_krusty_svc;

-- Identical grants to all four roles; the masking policy is the only differentiator.
-- For simplicity, we do this using a bit of scripting by building an array of the four
-- tenant role names and then loop over each to pull in the role name `:r` and
-- give them access to the DB, serving schema, sales view, and warehosue for compute.
EXECUTE IMMEDIATE $$
DECLARE
  roles ARRAY := ARRAY_CONSTRUCT('tenant_duff_admin','tenant_duff_viewer',
                                 'tenant_krusty_admin','tenant_krusty_viewer');
BEGIN
  FOR i IN 0 TO ARRAY_SIZE(:roles)-1 DO
    LET r STRING := GET(:roles, :i)::STRING;
    EXECUTE IMMEDIATE 'GRANT USAGE ON DATABASE opt_db TO ROLE ' || :r;
    EXECUTE IMMEDIATE 'GRANT USAGE ON SCHEMA opt_db.serving TO ROLE ' || :r;
    EXECUTE IMMEDIATE 'GRANT SELECT ON VIEW opt_db.serving.sales TO ROLE ' || :r;
    EXECUTE IMMEDIATE 'GRANT USAGE ON WAREHOUSE opt_wh TO ROLE ' || :r;
  END FOR;
END;
$$;
