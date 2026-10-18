import { readFileSync, existsSync } from "node:fs";
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
