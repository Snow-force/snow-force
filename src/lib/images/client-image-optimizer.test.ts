import { describe, expect, it, vi } from "vitest";

import {
  calculateContainedDimensions,
  optimizeImageFile,
  type ImageOptimizationRuntime,
} from "./client-image-optimizer";

function runtimeFor(encodedSize: number, dimensions = { width: 4000, height: 2000 }) {
  const close = vi.fn();
  const runtime: ImageOptimizationRuntime = {
    decode: vi.fn().mockResolvedValue({ source: {} as CanvasImageSource, ...dimensions, close }),
    encode: vi.fn().mockResolvedValue(new Blob([new Uint8Array(encodedSize)], { type: "image/webp" })),
  };
  return { runtime, close };
}

describe("calculateContainedDimensions", () => {
  it("keeps small images unchanged", () => {
    expect(calculateContainedDimensions(1200, 800, 2400)).toEqual({ width: 1200, height: 800 });
  });

  it("scales the longest edge while preserving aspect ratio", () => {
    expect(calculateContainedDimensions(4000, 2000, 1920)).toEqual({ width: 1920, height: 960 });
  });
});

describe("optimizeImageFile", () => {
  it("returns a smaller WebP file with the resized dimensions", async () => {
    const file = new File([new Uint8Array(1000)], "Mountain Cover.PNG", {
      type: "image/png",
      lastModified: 123,
    });
    const { runtime, close } = runtimeFor(200);

    const result = await optimizeImageFile(file, { maxDimension: 1920, quality: 0.8 }, runtime);

    expect(result).not.toBe(file);
    expect(result.name).toBe("Mountain Cover.webp");
    expect(result.type).toBe("image/webp");
    expect(result.size).toBe(200);
    expect(runtime.encode).toHaveBeenCalledWith(expect.anything(), 1920, 960, 0.8);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps the original when WebP would be larger", async () => {
    const file = new File([new Uint8Array(100)], "photo.jpg", { type: "image/jpeg" });
    const { runtime, close } = runtimeFor(150, { width: 800, height: 600 });

    await expect(optimizeImageFile(file, {}, runtime)).resolves.toBe(file);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps GIF files unchanged to preserve animation", async () => {
    const file = new File([new Uint8Array(100)], "animation.gif", { type: "image/gif" });
    const { runtime } = runtimeFor(20);

    await expect(optimizeImageFile(file, {}, runtime)).resolves.toBe(file);
    expect(runtime.decode).not.toHaveBeenCalled();
  });
});
