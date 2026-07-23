-- In comaprison to what I did early on with hardcoding in the SPCS basics'
-- repo, this uses CURRENT_USER() which prevents the above 🎉
USE ROLE ACCOUNTADMIN;

CREATE ROLE IF NOT EXISTS opt_admin;
GRANT ROLE opt_admin TO ROLE SYSADMIN;

SET grant_stmt = 'GRANT ROLE opt_admin TO USER "' || CURRENT_USER() || '"';
EXECUTE IMMEDIATE $grant_stmt;
