#!/usr/bin/env bash
set -euo pipefail

# Keycloak only authenticates humans for the app now. Snowflake never sees
# these tokens, so there's no snowflake_user/scp claim and no OAuth integration.
REALM="tenants"
WEB_CLIENT="mtt-web"
APP_BASE_URL="${APP_BASE_URL:-http://localhost:8000}"
# username : password : label
USERS=(
  "barney:duff123:Barney (Duff Beer, admin)"
  "moe:duff123:Moe (Duff Beer, viewer)"
  "marge:krusty123:Marge (Krusty Burger, admin)"
  "homer:krusty123:Homer (Krusty Burger, viewer)"
  "apu:kwik123:Apu (Kwik-E-Mart, not yet onboarded)"
)

kc() { docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh "$@"; }

kc config credentials --server http://localhost:8080 --realm master --user admin --password admin
kc create realms -s realm="${REALM}" -s enabled=true 2>/dev/null || true

# Confidential BFF client (authorization code + PKCE)
cid=$(kc create clients -r "${REALM}" \
  -s clientId="${WEB_CLIENT}" -s enabled=true \
  -s clientAuthenticatorType=client-secret \
  -s serviceAccountsEnabled=false -s standardFlowEnabled=true \
  -s directAccessGrantsEnabled=false -s publicClient=false \
  -s "redirectUris=[\"${APP_BASE_URL}/auth/callback\"]" \
  -s "webOrigins=[\"${APP_BASE_URL}\"]" \
  -s 'attributes."post.logout.redirect.uris"='"${APP_BASE_URL}"'/*' \
  -s 'attributes."pkce.code.challenge.method"=S256' -i 2>/dev/null ||
  kc get clients -r "${REALM}" -q clientId="${WEB_CLIENT}" --fields id --format csv --noquotes | tail -1)

secret=$(kc get "clients/${cid}/client-secret" -r "${REALM}" --fields value --format csv --noquotes | tail -1)
echo "WEB_CLIENT_SECRET=${secret}" >auth/web.env
echo ">> wrote auth/web.env"

# Tenant and access level are NOT stored here -- they live in
# security.entitlements, keyed by username.
for u in "${USERS[@]}"; do
  IFS=":" read -r username password label <<<"$u"
  first="${label%% (*}"                        # "Barney (Duff Beer, admin)" -> "Barney"
  brand="${label#*(}"; brand="${brand%%,*}"    # -> "Duff Beer" (Keycloak 26 requires lastName)
  uid=$(kc create users -r "${REALM}" \
    -s username="${username}" -s enabled=true -s emailVerified=true \
    -s "email=${username}@example.com" \
    -s "firstName=${first}" -s "lastName=${brand}" -i 2>/dev/null ||
    kc get users -r "${REALM}" -q username="${username}" --fields id --format csv --noquotes | tail -1)
  kc set-password -r "${REALM}" --userid "${uid}" --new-password "${password}"
  echo ">> user ${username}"
done
