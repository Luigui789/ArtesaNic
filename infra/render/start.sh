#!/usr/bin/env bash
set -euo pipefail

: "${PORT:=10000}"
: "${DJANGO_MEDIA_ROOT:=/var/data/media}"
: "${DJANGO_PRIVATE_MEDIA_ROOT:=/var/data/private_media}"

mkdir -p "$DJANGO_MEDIA_ROOT" "$DJANGO_PRIVATE_MEDIA_ROOT" /workspace/staticfiles
python manage.py collectstatic --noinput

envsubst '\$PORT' < /etc/nginx/templates/artesanic.conf.template > /etc/nginx/conf.d/artesanic.conf
nginx -t

nginx -g 'daemon off;' &
nginx_pid=$!
gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 2 --access-logfile - --error-logfile - &
django_pid=$!

finish() {
    kill -TERM "$nginx_pid" "$django_pid" 2>/dev/null || true
    wait "$nginx_pid" "$django_pid" 2>/dev/null || true
}
trap finish EXIT TERM INT
wait -n "$nginx_pid" "$django_pid"
