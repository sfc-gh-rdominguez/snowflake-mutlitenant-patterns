#!/usr/bin/env bash
# One-shot build: runs every walkthrough step in order, verifying as it goes.
# Safe to re-run. Usage: just up <connection>
set -euo pipefail

C="${1:?usage: just up <connection>}"
cd "$(dirname "$0")/.."

step=""
trap 'echo; echo "✗ failed at: $step (see the matching step in docs/00_WALKTHROUGH.md)"' ERR

run() { step="$1"; shift; echo; echo "▶ $step"; "$@"; }

# Poll a command until it succeeds: wait_for <label> <timeout_s> <cmd...>
wait_for() {
  local label="$1" timeout="$2"; shift 2
  local start=$SECONDS
  until "$@" >/dev/null 2>&1; do
    (( SECONDS - start > timeout )) && { echo "✗ timed out after ${timeout}s waiting for $label"; return 1; }
    sleep 3
  done
  echo "✓ $label"
}

sf() { snow sql -c "$C" --format json -q "$1"; }

step=".env"
[[ -f .env ]] || { echo "✗ no .env: cp .env.example .env and fill it in"; exit 1; }
set -a; source .env; set +a
[[ "${SNOWFLAKE_ACCOUNT:-}" == "MYORG-MYACCOUNT" || -z "${SNOWFLAKE_ACCOUNT:-}" ]] && { echo "✗ set SNOWFLAKE_ACCOUNT in .env"; exit 1; }
[[ -z "${SNOWFLAKE_HOST:-}" || "$SNOWFLAKE_HOST" == "myorg-myaccount.snowflakecomputing.com" ]] && { echo "✗ set SNOWFLAKE_HOST in .env"; exit 1; }

run "doctor" just doctor "$C"

# The BFF signs its JWT for SNOWFLAKE_ACCOUNT; a mismatch fails later as "JWT token is invalid"
step="account"
actual=$(sf "SELECT CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME() AS A" | jq -r '.[0].A')
upper() { tr '[:lower:]' '[:upper:]' <<<"$1"; }
if [[ "$(upper "$SNOWFLAKE_ACCOUNT")" != "$(upper "$actual")" ]]; then
  echo "✗ .env SNOWFLAKE_ACCOUNT=$SNOWFLAKE_ACCOUNT, but connection '$C' is $actual"; exit 1
fi
echo "✓ SNOWFLAKE_ACCOUNT matches $actual"

run "setup" just setup "$C"

step="keypair"
if [[ -f keys/app_svc.p8 ]]; then echo "· keys/app_svc.p8 exists, keeping it"; else run "keypair" just keypair; fi
run "set-key" just set-key "$C"
step="fingerprint"
local_fp=$(just fingerprint)
remote_fp=$(sf "DESC USER mtt_app_svc" | jq -r '.[] | select(.property == "RSA_PUBLIC_KEY_FP") | .value')
[[ "$local_fp" == "$remote_fp" ]] || { echo "✗ MTT_APP_SVC key ($remote_fp) doesn't match keys/app_svc.pub ($local_fp)"; exit 1; }
echo "✓ MTT_APP_SVC has the local public key"

run "idp-up"   just idp-up
run "idp-seed" just idp-seed
run "app-up"   just app-up
step="app";    wait_for "app up on :8000" 120 curl -sf localhost:8000/healthcheck
step="api";    wait_for "api up on :8001" 60 curl -sf localhost:8001/healthcheck

# Proves key-pair auth end to end, and that the policies fail closed for an unknown end user
step="fail-closed check"; echo; echo "▶ $step"
docker compose exec -T api bun -e '
  import { queryAs } from "./src/snowflake.ts";
  const [r] = await queryAs("nobody", `SELECT COUNT(*) AS "N" FROM mtt_db.base.sales`);
  if (r.N !== 0) { console.error(`expected 0 rows for an unknown end user, got ${r.N}`); process.exit(1); }
'
echo "✓ MTT_APP_SVC connects, and an unentitled end user sees 0 rows"

trap - ERR
cat <<EOF

✓ Done. App: http://localhost:8000

Sign in as barney / duff123 (or moe, marge, homer, apu; see docs/00_WALKTHROUGH.md).
Onboard apu with one row:
  just tenant-add $C apu kwik viewer

Re-running 'just up' reseeds entitlements, which undoes tenant-add.
Remove everything:
  just teardown $C
EOF
