#!/bin/sh
set -e
: "${PORT:=8080}"
: "${POSTGREST_UPSTREAM:?POSTGREST_UPSTREAM required}"
: "${STORAGE_UPSTREAM:?STORAGE_UPSTREAM required}"

export PORT POSTGREST_UPSTREAM STORAGE_UPSTREAM
envsubst '${PORT} ${POSTGREST_UPSTREAM} ${STORAGE_UPSTREAM}' \
  < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Generate per-function routes from FUNCTIONS_UPSTREAMS:
#   "name1=https://fn-name1-xxx.a.run.app name2=https://fn-name2-yyy.a.run.app"
mkdir -p /etc/nginx/conf.d
: > /etc/nginx/conf.d/functions.conf
for pair in ${FUNCTIONS_UPSTREAMS:-}; do
  name="${pair%%=*}"
  url="${pair#*=}"
  [ -z "${name}" ] || [ -z "${url}" ] && continue
  cat >> /etc/nginx/conf.d/functions.conf <<EOF
location /functions/v1/${name} {
  rewrite ^/functions/v1/${name}/?(.*)\$ /\$1 break;
  proxy_pass ${url};
  proxy_set_header Host \$proxy_host;
  proxy_set_header Authorization \$http_authorization;
  proxy_pass_request_headers on;
}
EOF
done

echo "[gateway] :${PORT} rest->${POSTGREST_UPSTREAM} storage->${STORAGE_UPSTREAM} functions=$(grep -c '^location' /etc/nginx/conf.d/functions.conf 2>/dev/null || echo 0)"
exec nginx -g 'daemon off;'
