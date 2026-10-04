import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
