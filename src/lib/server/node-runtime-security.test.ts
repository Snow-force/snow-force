import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("Node.js security release policy", () => {
  it.each(["", "services/commerce/"])("requires the patched Node 24 release in %s manifests and lockfiles", (prefix) => {
    const manifest = JSON.parse(read(`${prefix}package.json`));
    const lock = JSON.parse(read(`${prefix}package-lock.json`));
    expect(manifest.engines.node).toBe(">=24.22.1 <25");
    expect(lock.packages[""].engines.node).toBe(manifest.engines.node);
  });

  it.each(["Dockerfile.web", "services/commerce/Dockerfile"])("patches both build and runtime stages in %s", (file) => {
    const stages = [...read(file).matchAll(/^FROM (\S+) AS (\S+)\r?$/gm)];
    expect(stages.map((stage) => stage[2])).toEqual(["build", "runtime"]);
    for (const stage of stages) expect(stage[1]).toBe("node:24.22.1-bookworm-slim");
  });

  it("uses the same patched local and CI version", () => {
    expect(read(".nvmrc").trim()).toBe("24.22.1");
    expect(read(".github/workflows/ci.yml")).toContain("node-version-file: .nvmrc");
  });
});
