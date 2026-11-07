USE ROLE mtt_admin;
USE WAREHOUSE mtt_wh;
USE SCHEMA mtt_db.serving;

-- Saved report specs: layout plus the SQL for each section, never the data.
-- Re-running a report executes that SQL as the signed-in end user, so the
-- policies on base.sales apply again on every run.
CREATE TABLE IF NOT EXISTS serving.saved_reports (
  report_id   STRING NOT NULL,
  end_user_id STRING NOT NULL,
  app_user    STRING NOT NULL,
  title       STRING NOT NULL,
  spec        VARIANT NOT NULL,
  created_at  TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Each end user sees only their own reports, using the same immutable session
-- attribute as tenant_isolation. The BFF writes end_user_id from SYS_CONTEXT,
-- never from the request.
CREATE ROW ACCESS POLICY IF NOT EXISTS security.report_owner
  AS (owner STRING, app_user STRING) RETURNS BOOLEAN -> FALSE;
ALTER ROW ACCESS POLICY security.report_owner SET BODY ->
  (owner = SYS_CONTEXT('SNOWFLAKE$SESSION_ATTRIBUTES', 'end_user_id') AND app_user = CURRENT_USER())
  OR IS_ROLE_IN_SESSION('MTT_ADMIN');

-- IF NOT EXISTS keeps the table across re-runs, so only attach once.
EXECUTE IMMEDIATE $$
BEGIN
  ALTER TABLE serving.saved_reports ADD ROW ACCESS POLICY security.report_owner ON (end_user_id, app_user);
EXCEPTION
  WHEN OTHER THEN RETURN 'report_owner already attached';
END;
$$;

GRANT SELECT, INSERT, DELETE ON TABLE serving.saved_reports TO ROLE mtt_app_role;
