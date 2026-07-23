# Multitenant Architecture Patterns on Snowflake

Multitenancy on Snowflake comes down to one question: how much do your tenants
share? Share everything and you get density and a single data model to maintain,
but you lean hard on Snowflake's access controls to keep tenants apart. Share
nothing and isolation is trivial, but you multiply the objects - or accounts -
you have to operate.

This repository walks through the common patterns for serving many tenants from
Snowflake, from most-shared to most-isolated. Each one comes with a runnable
end-to-end example: a local app, an identity provider, and the Snowflake objects
that back them.

## Architectures

The patterns sit on a spectrum, trading tenant density against isolation and
blast radius. Which one fits depends on how strict your isolation requirements
are, how many tenants you expect, and how much per-tenant operational overhead
you're willing to carry.

### Multitenant Table (MTT)

The most-shared end of the spectrum. Every tenant's data lives in the same
physical tables, and isolation is enforced inside Snowflake with secure views
and policies that key off the querying role - a join to an entitlements table
for tenant (row) isolation, and a masking policy for per-role column access.
Each tenant gets one service account, mapped in from the app's identity provider
over External OAuth, plus a role per level of access.

It's the quickest path to a multitenant experience and the cheapest to operate -
one data model, shared compute - but it puts the most weight on getting your
access controls right, since a mistake leaks one tenant's rows to another.

See the [`mtt/` walkthrough](./mtt/docs/WALKTHROUGH.md) for a runnable example.

### Object Per Tenant (OTT)

Coming soon.

### Account Per Tenant (ATT)

Coming soon.

## How to use this repository

Each architecture lives in its own top-level directory (like
[`mtt/`](./mtt)), with a walkthrough under its `docs/` directory. To try one,
open that walkthrough and follow it top to bottom - the steps are `just` recipes
you run in order, so there's little to do beyond reading along and running the
commands.

## What you'll need

- [Docker](https://www.docker.com) - runs the local app and identity provider.
- [Snow CLI](https://docs.snowflake.com/en/developer-guide/snowflake-cli/index) -
  applies the Snowflake migrations.
- A free [ngrok](https://ngrok.com) account - tunnels your local identity
  provider to Snowflake.
- [just](https://github.com/casey/just) - runs the recipes each walkthrough is
  built around.

## Contributions or issues

Coming soon.
