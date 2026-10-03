import { randomBytes, createHash } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Initialize a new protected directory; never overwrite an existing deployment.
export function initializeRedisSecrets(directory, openssl = "openssl") {
  const target = resolve(directory);
  const probe = spawnSync(openssl, ["version"], { encoding: "utf8", timeout: 10_000 });
  if (probe.status !== 0) throw new Error("OpenSSL must be installed before initializing Redis secrets.");
  mkdirSync(target, { mode: 0o700 });
  const password = randomBytes(32).toString("hex");
  const write = (name, value, mode = 0o444) => writeFileSync(resolve(target, name), value, { mode, flag: "wx" });
  const run = (step, args) => {
    const result = spawnSync(openssl, args, { cwd: target, encoding: "utf8", timeout: 60_000 });
    if (result.status !== 0) throw new Error(`Redis certificate initialization failed at ${step}; preserve the protected directory for diagnosis.`);
  };
  write("password", password + "\n");
  write("users.acl", `user default on #${createHash("sha256").update(password).digest("hex")} ~* &* +@all\n`);
  write("redis.env", `REDIS_URL=rediss://default:${password}@redis:6379\n`, 0o600);
  write("server.ext", "subjectAltName=DNS:redis\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n", 0o600);
  run("CA", ["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "3650", "-nodes", "-keyout", "ca-key.pem", "-out", "ca.pem", "-subj", "/CN=SnowForce Redis CA", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"]);
  run("server request", ["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "server-key.pem", "-out", "server.csr", "-subj", "/CN=redis"]);
  run("server certificate", ["x509", "-req", "-in", "server.csr", "-CA", "ca.pem", "-CAkey", "ca-key.pem", "-CAcreateserial", "-days", "365", "-sha256", "-extfile", "server.ext", "-out", "server.pem"]);
  chmodSync(resolve(target, "ca-key.pem"), 0o600);
  for (const name of ["ca.pem", "server.pem", "server-key.pem"]) chmodSync(resolve(target, name), 0o444);
  run("certificate verification", ["verify", "-CAfile", "ca.pem", "-verify_hostname", "redis", "server.pem"]);
  // Compose mounts files read-only. The root-owned parent stays mode 0700.
  return { directory: target, files: ["ca.pem", "server.pem", "server-key.pem", "users.acl", "password", "redis.env"] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error("Usage: node init-redis-secrets.mjs /absolute/new/protected/redis-directory");
    process.exitCode = 1;
  } else {
    try {
      initializeRedisSecrets(process.argv[2]);
      console.log("Redis credentials and certificates created in the specified directory. No secrets were printed. Protect and back up the directory as documented.");
    } catch (error) {
      console.error(error.code === "EEXIST" ? "Refusing to overwrite existing Redis credentials." : "Redis initialization failed; inspect the protected directory locally. No secrets were printed.");
      process.exitCode = 1;
    }
  }
}
