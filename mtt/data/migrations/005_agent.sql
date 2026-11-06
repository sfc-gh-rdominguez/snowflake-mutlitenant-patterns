USE ROLE mtt_admin;
USE WAREHOUSE mtt_wh;
USE SCHEMA mtt_db.serving;

-- The semantic view knows nothing about tenants: isolation lives in the
-- policies on base.sales, so it holds for any SQL Cortex Analyst generates.
CREATE OR REPLACE SEMANTIC VIEW serving.sales_sv
  TABLES (
    sales AS mtt_db.base.sales PRIMARY KEY (sale_id)
      COMMENT = 'Individual sales. Each row is one sale.'
  )
  FACTS (
    sales.quantity_sold AS quantity COMMENT = 'Units sold in the sale',
    sales.sale_amount   AS amount   COMMENT = 'Sale amount in USD; NULL when the user may not see revenue'
  )
  DIMENSIONS (
    sales.region   AS region  COMMENT = 'Sales region: NA, EMEA, APAC or LATAM',
    sales.product  AS product COMMENT = 'Product name',
    sales.sale_date AS DATE(sale_ts) COMMENT = 'Date of the sale',
    sales.sale_month AS DATE_TRUNC('month', sale_ts) COMMENT = 'Month of the sale'
  )
  METRICS (
    sales.order_count   AS COUNT(sale_id)    COMMENT = 'Number of sales (orders)',
    sales.units_sold    AS SUM(quantity)     COMMENT = 'Total units sold',
    sales.total_revenue AS SUM(amount)       COMMENT = 'Total revenue in USD; NULL when revenue is restricted',
    sales.avg_order_value AS AVG(amount)     COMMENT = 'Average sale amount in USD'
  )
  COMMENT = 'Sales for the signed-in tenant';

CREATE OR REPLACE AGENT serving.sales_agent
  COMMENT = 'Answers questions about the signed-in tenant''s sales'
  FROM SPECIFICATION $$
models:
  orchestration: claude-sonnet-4-6
instructions:
  orchestration: >-
    Use the sales_analyst tool for any question about sales, orders, products,
    regions, units or revenue.
  response: >-
    Be concise. If revenue values come back NULL, say revenue is restricted for
    this user rather than calling it zero or missing data.
tools:
  - tool_spec:
      type: cortex_analyst_text_to_sql
      name: sales_analyst
      description: Sales by region, product and date, with order, unit and revenue metrics.
tool_resources:
  sales_analyst:
    semantic_view: MTT_DB.SERVING.SALES_SV
    execution_environment:
      type: warehouse
      warehouse: MTT_WH
$$;

GRANT SELECT ON SEMANTIC VIEW serving.sales_sv TO ROLE mtt_app_role;
GRANT USAGE ON AGENT serving.sales_agent TO ROLE mtt_app_role;
