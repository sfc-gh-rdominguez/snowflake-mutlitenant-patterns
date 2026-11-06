#!/usr/bin/env bash
set -euo pipefail

REALM="tenants"
# tenant : class : snowflake_user : role
CLIENTS=(
  "duff:admin:TENANT_DUFF_SVC:TENANT_DUFF_ADMIN"
  "duff:viewer:TENANT_DUFF_SVC:TENANT_DUFF_VIEWER"
  "krusty:admin:TENANT_KRUSTY_SVC:TENANT_KRUSTY_ADMIN"
  "krusty:viewer:TENANT_KRUSTY_SVC:TENANT_KRUSTY_VIEWER"
)

kc() { docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh "$@"; }

kc config credentials --server http://localhost:8080 --realm master --user admin --password admin
kc create realms -s realm="${REALM}" -s enabled=true 2>/dev/null || true

echo "{" >auth/clients.json
first=true
for c in "${CLIENTS[@]}"; do
  IFS=":" read -r tenant class sfuser sfrole <<<"$c"
  client="tenant-${tenant}-${class}"

  cid=$(kc create clients -r "${REALM}" \
    -s clientId="${client}" -s enabled=true \
    -s clientAuthenticatorType=client-secret \
    -s serviceAccountsEnabled=true -s standardFlowEnabled=false \
    -s directAccessGrantsEnabled=false -s publicClient=false -i 2>/dev/null ||
    kc get clients -r "${REALM}" -q clientId="${client}" --fields id --format csv --noquotes | tail -1)

  kc create "clients/${cid}/protocol-mappers/models" -r "${REALM}" \
    -s name=aud -s protocol=openid-connect -s protocolMapper=oidc-audience-mapper \
    -s 'config."included.custom.audience"=snowflake' -s 'config."access.token.claim"=true' 2>/dev/null || true

  kc create "clients/${cid}/protocol-mappers/models" -r "${REALM}" \
    -s name=sfuser -s protocol=openid-connect -s protocolMapper=oidc-hardcoded-claim-mapper \
    -s 'config."claim.name"=snowflake_user' -s "config.\"claim.value\"=${sfuser}" \
    -s 'config."jsonType.label"=String' -s 'config."access.token.claim"=true' 2>/dev/null || true

  kc create "clients/${cid}/protocol-mappers/models" -r "${REALM}" \
    -s name=sfrole -s protocol=openid-connect -s protocolMapper=oidc-hardcoded-claim-mapper \
    -s 'config."claim.name"=scp' -s "config.\"claim.value\"=session:role:${sfrole}" \
    -s 'config."jsonType.label"=String' -s 'config."access.token.claim"=true' 2>/dev/null || true

  secret=$(kc get "clients/${cid}/client-secret" -r "${REALM}" --fields value --format csv --noquotes | tail -1)

  $first || echo "," >>auth/clients.json
  first=false
  printf '  "%s:%s": { "clientId": "%s", "clientSecret": "%s" }' "${tenant}" "${class}" "${client}" "${secret}" >>auth/clients.json
done
echo "" >>auth/clients.json
echo "}" >>auth/clients.json
echo ">> wrote auth/clients.json"
