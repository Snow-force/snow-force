import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:tls";
import { initializeRedisSecrets } from "../deploy/single-server/init-redis-secrets.mjs";

const require = createRequire(import.meta.url);
const { parse } = require("yaml");
const deployment = fileURLToPath(new URL("../deploy/single-server/", import.meta.url));
const compose = parse(readFileSync(resolve(deployment, "compose.yaml"), "utf8"));
const openssl = process.env.OPENSSL_PATH || (process.platform === "win32" && existsSync("C:/Program Files/Git/usr/bin/openssl.exe") ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl");
let fixture;
let credentials;

before(() => {
  fixture = mkdtempSync(resolve(tmpdir(), "snowforce-redis-tls-"));
  credentials = resolve(fixture, "redis");
  initializeRedisSecrets(credentials, openssl);
});
after(() => {
  if (!fixture) return;
  if (existsSync(credentials)) for (const file of readdirSync(credentials)) chmodSync(resolve(credentials, file), 0o600);
  rmSync(fixture, { recursive: true, force: true });
});

test("the single server exposes only HTTPS proxy ports and isolates Redis from the proxy", () => {
  assert.deepEqual(compose.services.proxy.ports, ["80:80", "443:443"]);
  assert.equal(compose.services.commerce.ports, undefined);
  assert.equal(compose.services.redis.ports, undefined);
  assert.equal(compose.networks.queue.internal, true);
  assert.deepEqual(compose.services.redis.networks, ["queue"]);
  assert.deepEqual(compose.services.proxy.networks, ["web"]);
  assert.deepEqual(compose.services.commerce.networks, ["web", "queue"]);
  assert.equal(compose.services.commerce.environment.COMMERCE_OPERATING_MODE, "management");
  assert.equal(compose.services.commerce.environment.COMMERCE_TAX_POLICY_CONFIRMED, "false");
  assert.equal(compose.services.commerce.environment.MEDUSA_WORKER_MODE, "shared");
  assert.equal(compose.services.commerce.pull_policy, "never");
});

test("Redis persistence, authentication and verified TLS survive container replacement", () => {
  const config = readFileSync(resolve(deployment, "redis.conf"), "utf8");
  for (const directive of ["port 0", "tls-port 6379", "aclfile /run/secrets/redis_acl", "appendonly yes", "appendfsync everysec", "maxmemory-policy noeviction"]) assert.ok(config.split("\n").includes(directive), directive);
  assert.ok(compose.services.redis.volumes.includes("redis-data:/data"));
  assert.ok(compose.services.proxy.volumes.includes("caddy-data:/data"));
  assert.equal(compose.services.commerce.environment.NODE_EXTRA_CA_CERTS, "/run/secrets/redis_ca");
  assert.deepEqual(compose.services.commerce.secrets, ["redis_ca"]);
  assert.equal(compose.services.commerce.depends_on.redis.condition, "service_healthy");
  assert.equal(compose.services.proxy.depends_on.commerce.condition, "service_healthy");
  assert.ok(compose.services.redis.healthcheck.test[1].includes("--tls --cacert"));
  assert.ok(compose.services.redis.healthcheck.test[1].includes("$$(cat /run/secrets/redis_password)"));
  for (const service of Object.values(compose.services)) assert.equal(service.restart, "unless-stopped");
});

test("initialization creates a random password and matching hashed ACL without overwriting credentials", () => {
  const password = readFileSync(resolve(credentials, "password"), "utf8").trim();
  assert.match(password, /^[a-f0-9]{64}$/);
  const acl = readFileSync(resolve(credentials, "users.acl"), "utf8");
  assert.ok(acl.includes("#" + createHash("sha256").update(password).digest("hex")));
  assert.equal(acl.includes(password), false);
  const url = new URL(readFileSync(resolve(credentials, "redis.env"), "utf8").trim().slice("REDIS_URL=".length));
  assert.equal(url.protocol, "rediss:");
  assert.equal(url.hostname, "redis");
  assert.equal(url.password === password, true);
  assert.throws(() => initializeRedisSecrets(credentials, openssl), { code: "EEXIST" });
  assert.equal(readFileSync(resolve(credentials, "password"), "utf8").trim() === password, true);
  if (process.platform !== "win32") {
    assert.equal(statSync(credentials).mode & 0o777, 0o700);
    assert.equal(statSync(resolve(credentials, "ca-key.pem")).mode & 0o777, 0o600);
    assert.equal(statSync(resolve(credentials, "redis.env")).mode & 0o777, 0o600);
  }
});

async function client(port, hostname, trust = true) {
  const script = `
    const tls = require('node:tls');
    const socket = tls.connect({host:'127.0.0.1',port:${port},servername:${JSON.stringify(hostname)}}, () => {
      process.stdout.write(String(socket.authorized));socket.end();
    });
    socket.on('error', error => {process.stderr.write(error.code || 'TLS_FAILED');process.exitCode=1;});
  `;
  const env = { ...process.env };
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  delete env.NODE_EXTRA_CA_CERTS;
  if (trust) env.NODE_EXTRA_CA_CERTS = resolve(credentials, "ca.pem");
  return await new Promise((resolveResult, reject) => {
    const processHandle = spawn(process.execPath, ["-e", script], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    processHandle.stdout.on("data", value => { stdout += value; });
    processHandle.stderr.on("data", value => { stderr += value; });
    processHandle.on("error", reject);
    processHandle.on("close", code => resolveResult({ code, stdout, stderr }));
  });
}

test("the generated CA works through Node's production trust setting and rejects wrong hostnames or missing trust", async () => {
  const server = createServer({ key: readFileSync(resolve(credentials, "server-key.pem")), cert: readFileSync(resolve(credentials, "server.pem")) }, socket => socket.end());
  await new Promise(resolveReady => server.listen(0, "127.0.0.1", resolveReady));
  try {
    const port = server.address().port;
    const verified = await client(port, "redis");
    assert.deepEqual(verified, { code: 0, stdout: "true", stderr: "" });
    const wrongHostname = await client(port, "wrong.invalid");
    assert.equal(wrongHostname.code, 1);
    assert.match(wrongHostname.stderr, /ERR_TLS_CERT_ALTNAME_INVALID/);
    const untrusted = await client(port, "redis", false);
    assert.equal(untrusted.code, 1);
    assert.equal(untrusted.stdout, "");
  } finally { await new Promise(resolveClosed => server.close(resolveClosed)); }
});

test("a missing OpenSSL executable creates no partial directory or secret files", () => {
  const target = resolve(fixture, "not-created");
  assert.throws(() => initializeRedisSecrets(target, resolve(fixture, "missing-openssl")), /OpenSSL must be installed/);
  assert.equal(existsSync(target), false);
});

test("Railway initialization certifies only the explicit private DNS name and rejects unsafe names before creating files", () => {
  const target = resolve(fixture, "railway");
  const hostname = "snowforce-redis.railway.internal";
  initializeRedisSecrets(target, openssl, hostname);
  const certificate = new X509Certificate(readFileSync(resolve(target, "server.pem")));
  assert.equal(certificate.checkHost(hostname), hostname);
  assert.equal(certificate.checkHost("wrong.railway.internal"), undefined);
  assert.equal(certificate.checkHost("redis"), undefined);
  const url = new URL(readFileSync(resolve(target, "redis.env"), "utf8").trim().slice("REDIS_URL=".length));
  assert.equal(url.hostname, hostname);
  for (const invalid of ["", "../redis", "redis\nport 6379", "https://redis", "*.railway.internal", "Redis", "a".repeat(64)]) {
    const invalidTarget = resolve(fixture, "invalid-host");
    assert.throws(() => initializeRedisSecrets(invalidTarget, openssl, invalid), /valid lowercase DNS/);
    assert.equal(existsSync(invalidTarget), false);
  }
});

test("the operator CLI redacts successful initialization and refuses a second initialization", () => {
  const target = resolve(fixture, "cli");
  const environment = { ...process.env, PATH: dirname(openssl) + delimiter + process.env.PATH };
  const run = args => spawnSync(process.execPath, [resolve(deployment, "init-redis-secrets.mjs"), ...args], { env: environment, encoding: "utf8", timeout: 30_000 });
  try {
    const first = run([target]);
    assert.equal(first.status, 0, first.stderr);
    const password = readFileSync(resolve(target, "password"), "utf8").trim();
    assert.equal((first.stdout + first.stderr).includes(password), false);
    assert.match(first.stdout, /No secrets were printed/);
    const second = run([target]);
    assert.equal(second.status, 1);
    assert.match(second.stderr, /Refusing to overwrite/);
    assert.equal((second.stdout + second.stderr).includes(password), false);
    assert.equal(readFileSync(resolve(target, "password"), "utf8").trim() === password, true);
    const missingArgument = run([]);
    assert.equal(missingArgument.status, 1);
    assert.match(missingArgument.stderr, /Usage:/);
  } finally {
    if (existsSync(target)) {
      for (const file of readdirSync(target)) chmodSync(resolve(target, file), 0o600);
      rmSync(target, { recursive: true, force: true });
    }
  }
});
