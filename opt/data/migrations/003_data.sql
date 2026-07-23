USE ROLE opt_admin;
USE WAREHOUSE opt_wh;
USE SCHEMA opt_db.base;

-- One physical table for all tenants, clustered by (tenant_id, sale_ts) so a
-- tenant-scoped query prunes other tenants' micro-partitions.
CREATE OR REPLACE TABLE base.sales (
  tenant_id STRING, sale_id NUMBER, sale_ts TIMESTAMP_NTZ,
  region STRING, product STRING, quantity NUMBER, amount NUMBER(12, 2)
) CLUSTER BY (tenant_id, sale_ts);

INSERT INTO base.sales
SELECT
  GET(ARRAY_CONSTRUCT('duff','krusty'), UNIFORM(0,1,RANDOM()))::STRING           AS tenant_id,
  seq8()                                                                          AS sale_id,
  DATEADD('second', UNIFORM(0, 60*60*24*365, RANDOM()), '2024-01-01'::TIMESTAMP_NTZ) AS sale_ts,
  GET(ARRAY_CONSTRUCT('NA','EMEA','APAC','LATAM'), UNIFORM(0,3,RANDOM()))::STRING AS region,
  GET(ARRAY_CONSTRUCT('Widget','Gadget','Gizmo','Doohickey','Sprocket'),
      UNIFORM(0,4,RANDOM()))::STRING                                             AS product,
  UNIFORM(1,100,RANDOM())                                                        AS quantity,
  ROUND(UNIFORM(500,50000,RANDOM())/100.0, 2)                                    AS amount
FROM TABLE(GENERATOR(ROWCOUNT => 1000000));

-- Entitlements map a ROLE to its tenant. Both of a tenant's roles map to the
-- same tenant_id -- class never changes which rows you see, only what's masked.
CREATE OR REPLACE TABLE base.entitlements (role_name STRING, tenant_id STRING);
INSERT INTO base.entitlements VALUES
  ('TENANT_DUFF_ADMIN','duff'),   ('TENANT_DUFF_VIEWER','duff'),
  ('TENANT_KRUSTY_ADMIN','krusty'),('TENANT_KRUSTY_VIEWER','krusty');

-- Column masking is the admin/viewer differentiator. It evaluates against the
-- QUERYING role (not the view owner), so a viewer sees NULL for amount even
-- through the shared secure view. Admins (role ends in _ADMIN) see real values.
CREATE OR REPLACE MASKING POLICY base.mask_amount AS (val NUMBER) RETURNS NUMBER ->
  CASE WHEN ENDSWITH(CURRENT_ROLE(), '_ADMIN') THEN val ELSE NULL END;
ALTER TABLE base.sales MODIFY COLUMN amount SET MASKING POLICY base.mask_amount;

-- The secure view enforces tenant isolation via CURRENT_ROLE().
CREATE OR REPLACE SECURE VIEW serving.sales AS
  SELECT s.tenant_id, s.sale_id, s.sale_ts, s.region, s.product, s.quantity, s.amount
  FROM base.sales s
  JOIN base.entitlements e ON s.tenant_id = e.tenant_id
  WHERE e.role_name = CURRENT_ROLE();
