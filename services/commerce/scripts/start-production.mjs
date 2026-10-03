import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { configurationErrors } from "./preflight.mjs";

export function productionStartOptions(env) {
  const errors = configurationErrors({ ...env, NODE_ENV: "production" });
  const port = env.PORT ?? "9000";
  if (typeof port !== "string" || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) errors.push("PORT must be an integer between 1 and 65535.");
  return { errors, args: ["start", "--host", "0.0.0.0", "--port", port] };
}

export function startProduction(env = process.env) {
  const { errors, args } = productionStartOptions(env);
  if (errors.length) {
    console.error("Commerce startup stopped; no database changes were attempted:\n" + errors.map(error => `- ${error}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  const require = createRequire(import.meta.url);
  const child = spawn(process.execPath, [require.resolve("@medusajs/cli"), ...args], {
    stdio: "inherit", env: { ...env, NODE_ENV: "production" },
  });
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
  child.once("error", () => { console.error("Commerce server could not start."); process.exitCode = 1; });
  child.once("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startProduction();
