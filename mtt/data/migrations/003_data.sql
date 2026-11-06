USE ROLE mtt_admin;
USE WAREHOUSE mtt_wh;
USE DATABASE mtt_db;

-- One physical table for all tenants, clustered by (tenant_id, sale_ts) so a
-- tenant-scoped query prunes other tenants' micro-partitions. Kwik-E-Mart is
-- seeded but has no entitlements yet -- onboarding it is one INSERT later.
CREATE OR REPLACE TABLE base.sales (
  tenant_id STRING, sale_id NUMBER, sale_ts TIMESTAMP_NTZ,
  region STRING, product STRING, quantity NUMBER, amount NUMBER(12, 2)
) CLUSTER BY (tenant_id, sale_ts);

INSERT INTO base.sales
SELECT
  GET(ARRAY_CONSTRUCT('duff','krusty','kwik'), UNIFORM(0,2,RANDOM()))::STRING    AS tenant_id,
  seq8()                                                                          AS sale_id,
  DATEADD('second', UNIFORM(0, 60*60*24*365, RANDOM()), '2024-01-01'::TIMESTAMP_NTZ) AS sale_ts,
  GET(ARRAY_CONSTRUCT('NA','EMEA','APAC','LATAM'), UNIFORM(0,3,RANDOM()))::STRING AS region,
  GET(ARRAY_CONSTRUCT('Widget','Gadget','Gizmo','Doohickey','Sprocket'),
      UNIFORM(0,4,RANDOM()))::STRING                                             AS product,
  UNIFORM(1,100,RANDOM())                                                        AS quantity,
  ROUND(UNIFORM(500,50000,RANDOM())/100.0, 2)                                    AS amount
FROM TABLE(GENERATOR(ROWCOUNT => 1000000));

-- Entitlements map an END USER (the app's login, not a Snowflake identity) to a
-- tenant and access level. app_user binds each row to the Snowflake user allowed
-- to assert that end user, so no other Snowflake user can borrow it.
CREATE TABLE IF NOT EXISTS security.entitlements (
  end_user_id STRING NOT NULL, app_user STRING NOT NULL,
  tenant_id STRING NOT NULL, access_level STRING NOT NULL  -- 'admin' | 'viewer'
);
DELETE FROM security.entitlements;
INSERT INTO security.entitlements VALUES
  ('barney','MTT_APP_SVC','duff','admin'),   ('moe','MTT_APP_SVC','duff','viewer'),
  ('marge','MTT_APP_SVC','krusty','admin'),  ('homer','MTT_APP_SVC','krusty','viewer');

-- The app server sets `end_user_id` as an immutable session attribute; the
-- client never sends a tenant. No attribute, an unknown end user, or the wrong
-- Snowflake user all evaluate to FALSE -- fail closed.
CREATE ROW ACCESS POLICY IF NOT EXISTS security.tenant_isolation
  AS (tenant_col STRING) RETURNS BOOLEAN -> FALSE;
ALTER ROW ACCESS POLICY security.tenant_isolation SET BODY ->
  EXISTS (
    SELECT 1 FROM mtt_db.security.entitlements e
    WHERE e.end_user_id = SYS_CONTEXT('SNOWFLAKE$SESSION_ATTRIBUTES', 'end_user_id')
      AND e.app_user    = CURRENT_USER()
      AND e.tenant_id   = tenant_col
  )
  -- mtt_admin keeps full visibility for operating the data model.
  OR IS_ROLE_IN_SESSION('MTT_ADMIN');

-- Column masking is the admin/viewer differentiator, using the same lookup.
-- Masked by default.
CREATE MASKING POLICY IF NOT EXISTS security.mask_amount
  AS (val NUMBER(12, 2)) RETURNS NUMBER(12, 2) -> NULL;
ALTER MASKING POLICY security.mask_amount SET BODY ->
  CASE WHEN IS_ROLE_IN_SESSION('MTT_ADMIN') OR EXISTS (
    SELECT 1 FROM mtt_db.security.entitlements e
    WHERE e.end_user_id  = SYS_CONTEXT('SNOWFLAKE$SESSION_ATTRIBUTES', 'end_user_id')
      AND e.app_user     = CURRENT_USER()
      AND e.access_level = 'admin'
  ) THEN val ELSE NULL END;

-- CREATE OR REPLACE TABLE above dropped any prior attachments, so attach fresh.
ALTER TABLE base.sales ADD ROW ACCESS POLICY security.tenant_isolation ON (tenant_id);
ALTER TABLE base.sales MODIFY COLUMN amount SET MASKING POLICY security.mask_amount;
