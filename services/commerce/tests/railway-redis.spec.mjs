import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("../deploy/railway/redis/start.sh", import.meta.url));
const shell = process.platform === "win32" && existsSync("C:/Program Files/Git/usr/bin/sh.exe") ? "C:/Program Files/Git/usr/bin/sh.exe" : "sh";

test("the real Redis startup script rejects missing or malformed runtime credentials before accessing a volume or listening", () => {
  const fixture = { REDIS_PASSWORD: "a".repeat(64), REDIS_TLS_CERT: "fixture-public-certificate", REDIS_TLS_KEY: "fixture-private-key-never-print", REDIS_CA_CERT: "fixture-public-ca" };
  for (const missing of Object.keys(fixture)) {
    const environment = { ...process.env, ...fixture };
    delete environment[missing];
    const result = spawnSync(shell, [script], { env: environment, encoding: "utf8", timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /required/);
    for (const credential of Object.values(fixture)) assert.equal((result.stdout + result.stderr).includes(credential), false);
  }
  for (const password of ["short", "g".repeat(64), "a".repeat(63) + "\n"]) {
    const result = spawnSync(shell, [script], { env: { ...process.env, ...fixture, REDIS_PASSWORD: password }, encoding: "utf8", timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /generated 64-character|hexadecimal/);
    assert.equal((result.stdout + result.stderr).includes(fixture.REDIS_TLS_KEY), false);
  }
});

test("Redis starts again with an existing TLS directory and refreshes files without leaking credentials", () => {
  const directory = mkdtempSync(join(tmpdir(), "snowforce-redis-restart-"));
  try {
    // Exercise the actual shell script. Redirect only absolute container paths
    // and the privileged ownership step into this disposable host fixture.
    const source = readFileSync(script, "utf8")
      .replaceAll("/tmp/snowforce-redis-tls", "./tls")
      .replace("/usr/local/bin/docker-entrypoint.sh", "./entrypoint.sh")
      .replace("chown -R redis:redis ./tls", "test -d ./tls");
    writeFileSync(join(directory, "start.sh"), source);
    writeFileSync(join(directory, "entrypoint.sh"), '#!/bin/sh\nset -eu\n[ -z "${REDIS_PASSWORD+x}${REDIS_TLS_KEY+x}${REDIS_TLS_CERT+x}${REDIS_CA_CERT+x}" ]\nprintf "started\\n"\n', { mode: 0o700 });
    for (const generation of ["first", "restart"]) {
      const fixture = { REDIS_PASSWORD: (generation === "first" ? "a" : "b").repeat(64), REDIS_TLS_CERT: generation + "-certificate", REDIS_TLS_KEY: generation + "-private-key", REDIS_CA_CERT: generation + "-ca" };
      const result = spawnSync(shell, ["./start.sh"], { cwd: directory, env: { ...process.env, ...fixture }, encoding: "utf8", timeout: 10000 });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "started\n");
      assert.equal(result.stderr, "");
      for (const credential of Object.values(fixture)) assert.equal((result.stdout + result.stderr).includes(credential), false);
      assert.equal(readFileSync(join(directory, "tls/server.pem"), "utf8"), fixture.REDIS_TLS_CERT + "\n");
      assert.equal(readFileSync(join(directory, "tls/server-key.pem"), "utf8"), fixture.REDIS_TLS_KEY + "\n");
      assert.equal(readFileSync(join(directory, "tls/ca.pem"), "utf8"), fixture.REDIS_CA_CERT + "\n");
      const acl = readFileSync(join(directory, "tls/users.acl"), "utf8");
      assert.match(acl, /^user default on #[a-f0-9]{64} ~\* &\* \+@all\n$/);
      assert.equal(acl.includes(fixture.REDIS_PASSWORD), false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
