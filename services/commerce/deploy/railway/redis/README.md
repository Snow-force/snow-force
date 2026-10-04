# Railway private TLS Redis

Build this directory with its Dockerfile using the tested SnowForce release branch. The image uses the official Redis 7.4 Alpine base; runtime credentials never enter the image or Git. Attach a persistent volume at `/data`, use one replica, and keep the service private with no domain or TCP proxy.

Runtime variables: `REDIS_PASSWORD` (64 lowercase hex characters), `REDIS_TLS_CERT`, `REDIS_TLS_KEY`, `REDIS_CA_CERT` (PEM with actual newlines). Initialize a new protected directory with `init-redis-secrets.mjs` using the hostname `snowforce-redis.railway.internal`. Retain and protect the CA signing key locally; upload only the server certificate, server private key, CA certificate and password. Renew the server certificate before its one-year expiry.

The startup script stops when credentials are missing or the password is malformed. It writes credentials into a private temporary directory, hashes the password in the ACL, and delegates to the official entrypoint, which drops to the Redis user. Plaintext listening is disabled; TLS listens on 6379 over IPv4/IPv6. Redis uses AOF every second, periodic snapshots, 128 MB data maxmemory and `noeviction`.

Configure the Medusa backend with the matching `rediss://` URL and `REDIS_CA_CERT`. All of its Redis clients verify the certificate and hostname. Do not disable certificate verification or use a public Redis URL. Start with 0.5 GB Redis service capacity and validate memory headroom under the actual workload. The SnowForce workspace has a user-approved US$20 compute usage alert and US$25 compute usage hard limit; reaching the latter stops services.

Acceptance: verify authenticated TLS from the real Medusa process, refusal of bad credentials/certificate/hostname, retention of a disposable probe after restart, and absence of public TCP/HTTP exposure. Configure volume backups and test recovery before sales mode. Do not treat a successful image build as this acceptance.
