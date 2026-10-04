#!/bin/sh
set -eu
umask 077

# Fail before listening if a runtime credential is missing. Never log its value.
: "${REDIS_PASSWORD:?Redis password is required}"
: "${REDIS_TLS_CERT:?Redis server certificate is required}"
: "${REDIS_TLS_KEY:?Redis server private key is required}"
: "${REDIS_CA_CERT:?Redis CA is required}"
if [ "${#REDIS_PASSWORD}" -ne 64 ]; then
  printf '%s\n' 'Redis password must be a generated 64-character hex value.' >&2
  exit 1
fi
case "$REDIS_PASSWORD" in
  *[!a-f0-9]*) printf '%s\n' 'Redis password must be hexadecimal.' >&2; exit 1 ;;
esac

mkdir /tmp/snowforce-redis-tls
printf '%s\n' "$REDIS_TLS_CERT" > /tmp/snowforce-redis-tls/server.pem
printf '%s\n' "$REDIS_TLS_KEY" > /tmp/snowforce-redis-tls/server-key.pem
printf '%s\n' "$REDIS_CA_CERT" > /tmp/snowforce-redis-tls/ca.pem
password_hash=$(printf '%s' "$REDIS_PASSWORD" | sha256sum)
password_hash=${password_hash%% *}
printf 'user default on #%s ~* &* +@all\n' "$password_hash" > /tmp/snowforce-redis-tls/users.acl
unset password_hash REDIS_PASSWORD REDIS_TLS_KEY REDIS_TLS_CERT REDIS_CA_CERT
chown -R redis:redis /tmp/snowforce-redis-tls

# The official entrypoint fixes /data volume ownership and drops to the redis user.
exec /usr/local/bin/docker-entrypoint.sh redis-server /usr/local/etc/redis/redis.conf
