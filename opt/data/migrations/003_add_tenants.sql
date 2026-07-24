--NOTE: In a real-world scenario, we wouldn't store these "default" tenants in a
--migration. Instead, we'd have a script that would call the stored procedures
--from 002_tenants_sprocs.sql. We're taking a shortcut here for simplicity.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE opt_admin_wh;


CALL opt_admin_db.admin.create_tenant_db('duff');
CALL opt_admin_db.admin.create_tenant_schemas('duff');
CALL opt_admin_db.admin.create_tenant_wh('duff');
CALL opt_admin_db.admin.create_tenant_roles('duff');
CALL opt_admin_db.admin.create_tenant_svc_principal('duff');
CALL opt_admin_db.admin.create_tenant_data('duff');
CALL opt_admin_db.admin.grant_tenant_usage('duff');

CALL opt_admin_db.admin.create_tenant_db('krusty');
CALL opt_admin_db.admin.create_tenant_schemas('krusty');
CALL opt_admin_db.admin.create_tenant_wh('krusty');
CALL opt_admin_db.admin.create_tenant_roles('krusty');
CALL opt_admin_db.admin.create_tenant_svc_principal('krusty');
CALL opt_admin_db.admin.create_tenant_data('krusty');
CALL opt_admin_db.admin.grant_tenant_usage('krusty');
