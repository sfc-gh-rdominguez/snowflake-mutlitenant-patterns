-- In comaprison to what I did early on with hardcoding in the SPCS basics'
-- repo, this uses CURRENT_USER() which prevents the above 🎉
USE ROLE ACCOUNTADMIN;

CREATE ROLE IF NOT EXISTS mtt_admin;
GRANT ROLE mtt_admin TO ROLE SYSADMIN;

SET grant_stmt = 'GRANT ROLE mtt_admin TO USER "' || CURRENT_USER() || '"';
EXECUTE IMMEDIATE $grant_stmt;
