import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { workspaceDataPath } from "./json-store";
const require = createRequire(import.meta.url);
const config = require(path.join(process.cwd(), "next.config.js"));

describe("standalone deployment data boundaries", () => {
  it("keeps customer runtime records, tooling backups and uploaded evidence out of every server trace", () => {
    const excluded = config.outputFileTracingExcludes["/*"] as string[];
    for (const privateRoot of [".data", ".cache", ".codex-remote-attachments"]) expect(excluded).toContain(`${privateRoot}/**/*`);
    expect(config.output).toBe("standalone");
    expect(workspaceDataPath("registrations.json")).toBe(path.join(process.cwd(), ".data", "registrations.json"));
    // Exclusions affect packaging, not the runtime location of local persisted data.
    expect(excluded).not.toContain("src/**/*");
    expect(excluded).not.toContain("public/**/*");
  });
});
