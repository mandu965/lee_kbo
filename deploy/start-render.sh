#!/bin/sh
set -eu

export PORT="${PORT:-10000}"
envsubst '${PORT}' < /app/deploy/nginx.conf.template > /tmp/nginx.conf

cd /app/backend
uvicorn app.main:app --host 127.0.0.1 --port 8002 &
API_PID="$!"

cd /app/frontend
HOSTNAME=127.0.0.1 PORT=3000 npm run start &
WEB_PID="$!"

term() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap term INT TERM

nginx -c /tmp/nginx.conf -g 'daemon off;' &
NGINX_PID="$!"

wait "$NGINX_PID"
