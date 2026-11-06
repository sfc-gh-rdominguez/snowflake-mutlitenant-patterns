#!/usr/bin/env bash
set -euo pipefail

REALM="tenants"
WEB_CLIENT="mtt-web"
APP_BASE_URL="${APP_BASE_URL:-http://localhost:8000}"
# username : password : snowflake_user : role : label
USERS=(
  "barney:duff123:TENANT_DUFF_SVC:TENANT_DUFF_ADMIN:Barney (Duff Beer, admin)"
  "moe:duff123:TENANT_DUFF_SVC:TENANT_DUFF_VIEWER:Moe (Duff Beer, viewer)"
  "marge:krusty123:TENANT_KRUSTY_SVC:TENANT_KRUSTY_ADMIN:Marge (Krusty Burger, admin)"
  "homer:krusty123:TENANT_KRUSTY_SVC:TENANT_KRUSTY_VIEWER:Homer (Krusty Burger, viewer)"
)

kc() { docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh "$@"; }

kc config credentials --server http://localhost:8080 --realm master --user admin --password admin

# Allow unmanaged user attributes so snowflake_user/scp can live on the user.
kc update users/profile -r "${REALM}" -s 'unmanagedAttributePolicy=ENABLED' 2>/dev/null || true

# Confidential SPA/BFF client
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

# aud is still hardcoded; snowflake_user + scp now read from the USER's attributes.
kc create "clients/${cid}/protocol-mappers/models" -r "${REALM}" \
  -s name=aud -s protocol=openid-connect -s protocolMapper=oidc-audience-mapper \
  -s 'config."included.custom.audience"=snowflake' -s 'config."access.token.claim"=true' 2>/dev/null || true

kc create "clients/${cid}/protocol-mappers/models" -r "${REALM}" \
  -s name=sfuser -s protocol=openid-connect -s protocolMapper=oidc-usermodel-attribute-mapper \
  -s 'config."user.attribute"=snowflake_user' -s 'config."claim.name"=snowflake_user' \
  -s 'config."jsonType.label"=String' -s 'config."access.token.claim"=true' 2>/dev/null || true

kc create "clients/${cid}/protocol-mappers/models" -r "${REALM}" \
  -s name=sfrole -s protocol=openid-connect -s protocolMapper=oidc-usermodel-attribute-mapper \
  -s 'config."user.attribute"=scp' -s 'config."claim.name"=scp' \
  -s 'config."jsonType.label"=String' -s 'config."access.token.claim"=true' 2>/dev/null || true

secret=$(kc get "clients/${cid}/client-secret" -r "${REALM}" --fields value --format csv --noquotes | tail -1)
echo "WEB_CLIENT_SECRET=${secret}" >auth/web.env
echo ">> wrote auth/web.env"

for u in "${USERS[@]}"; do
  IFS=":" read -r username password sfuser sfrole label <<<"$u"
  first="${label%% (*}"          # "Barney (Duff Beer, admin)" -> "Barney"
  brand="${label#*(}"; brand="${brand%%,*}"   # -> "Duff Beer" (Keycloak 26 requires lastName)
  uid=$(kc create users -r "${REALM}" \
    -s username="${username}" -s enabled=true -s emailVerified=true \
    -s "email=${username}@example.com" \
    -s "attributes.snowflake_user=${sfuser}" \
    -s "attributes.scp=session:role:${sfrole}" \
    -s "firstName=${first}" -s "lastName=${brand}" -i 2>/dev/null ||
    kc get users -r "${REALM}" -q username="${username}" --fields id --format csv --noquotes | tail -1)
  kc set-password -r "${REALM}" --userid "${uid}" --new-password "${password}"
  echo ">> user ${username} -> ${sfrole}"
done
