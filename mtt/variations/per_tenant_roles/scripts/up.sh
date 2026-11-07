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

step=".env"
[[ -f .env ]] || { echo "✗ no .env: cp .env.example .env and fill it in"; exit 1; }
set -a; source .env; set +a
for v in NGROK_AUTHTOKEN KEYCLOAK_PUBLIC_URL SNOWFLAKE_HOST; do [[ -n "${!v:-}" ]] || { echo "✗ set $v in .env"; exit 1; }; done
[[ "$NGROK_AUTHTOKEN" == "2abc..." ]] && { echo "✗ set NGROK_AUTHTOKEN in .env"; exit 1; }
[[ "$SNOWFLAKE_HOST" == "abcd-xy12345.snowflakecomputing.com" ]] && { echo "✗ set SNOWFLAKE_HOST in .env"; exit 1; }

run "doctor" just doctor "$C"
run "setup"  just setup "$C"

# Snowflake fetches Keycloak's signing keys through the tunnel, so it must be publicly reachable
run "idp-up" just idp-up
step="tunnel"; wait_for "Keycloak reachable at $KEYCLOAK_PUBLIC_URL" 120 curl -sf "$KEYCLOAK_PUBLIC_URL/realms/master"
run "idp-seed"      just idp-seed
step="realm";  wait_for "signing keys published" 60 curl -sf "$KEYCLOAK_PUBLIC_URL/realms/tenants/protocol/openid-connect/certs"
run "oauth-add"     just oauth-add "$C"
run "idp-add-users" just idp-add-users
run "app-up"        just app-up
step="app";    wait_for "app up on :8000" 120 curl -sf localhost:8000/healthcheck
step="api";    wait_for "api up on :8001" 60 curl -sf localhost:8001/healthcheck

trap - ERR
cat <<EOF

✓ Done. App: http://localhost:8000

Sign in as barney / duff123 (or moe, marge, homer; see docs/00_WALKTHROUGH.md).
Remove everything:
  just teardown $C
EOF
