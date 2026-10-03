import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { configurationErrors } from "./preflight.mjs";

const environment = process.env.NODE_ENV || "development";
for (const file of [".env", `.env.${environment}`]) if (existsSync(file)) process.loadEnvFile(file);
const errors = configurationErrors(process.env);
if (errors.length) throw new Error(errors.join("\n"));

async function run(args) {
  const code = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit(signal ? 1 : code));
  });
  if (code !== 0) throw new Error("Commerce migration stopped; inspect the failed phase before retrying.");
}

const cli = resolve("node_modules/@medusajs/cli/cli.js");
// Medusa's link SQL redundantly creates an already-owned schema. Its planner
// also settles per-link failures without throwing. Keep the dedicated role's
// database CREATE permission revoked and verify each private link explicitly.
try {
  await run([cli, "db:migrate", "--skip-links", "--skip-search", "--skip-scripts", "--concurrency", "1", "--all-or-nothing"]);
  await run([resolve("scripts/sync-private-links.cjs")]);
  await run([cli, "db:migrate:search", "--execute-safe-search"]);
  await run([cli, "db:migrate:scripts"]);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Commerce migration failed.");
  process.exitCode = 1;
}
