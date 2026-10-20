import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("includes the summary summaryPath in the restricted web Docker build before type checking its source test", () => {
  const docker = readFileSync("Dockerfile.web", "utf8"), ignore = readFileSync("Dockerfile.web.dockerignore", "utf8");
  const summaryPath = "scripts/shop-performance-summary.mjs";
  expect(existsSync(summaryPath)).toBe(true);
  expect(readFileSync("src/lib/shop/performance-summary.test.ts", "utf8")).toContain("../../../" + summaryPath);
  expect(ignore.split(/\r?\n/)).toEqual(expect.arrayContaining(["**", "!scripts/", "!" + summaryPath]));
  expect(docker).toContain(`COPY ${summaryPath} ./${summaryPath}`);
  expect(docker.indexOf(`COPY ${summaryPath}`)).toBeLessThan(docker.indexOf("RUN npm run build"));
  expect(ignore).not.toContain("!scripts/**");
});

it("keeps private runtime files and dependency caches out of commits while retaining project deliverables", () => {
  const privatePaths = [
    ".env.local",
    ".cache/release-context.private.json",
    ".codex-remote-attachments/session/reference.jpg",
    ".pnpm-store/v11/index.db",
    "services/commerce/.env.development",
  ];
  const deliverables = [
    "docs/shop-performance-v4-acceptance-progress.md",
    "Products/catalog.pdf",
    "output/pdf/snowforce-shop-partner-guide.pdf",
    "services/commerce/.env.example",
  ];
  const ignored = execFileSync("git", ["check-ignore", "--no-index", "--stdin"], {
    input: [...privatePaths, ...deliverables].join("\n") + "\n",
    encoding: "utf8",
  }).trim().split(/\r?\n/);
  expect(ignored).toEqual(privatePaths);
});
