import { describe, expect, it, vi } from "vitest";

import {
  calculateContainedDimensions,
  ImageOptimizationError,
  optimizeImageFile,
  type ImageOptimizationRuntime,
} from "./client-image-optimizer";

function runtimeFor(encodedSizes: number | number[], dimensions = { width: 4000, height: 2000 }) {
  const close = vi.fn();
  const sizes = Array.isArray(encodedSizes) ? encodedSizes : [encodedSizes];
  let encodeIndex = 0;
  const runtime: ImageOptimizationRuntime = {
    decode: vi.fn().mockResolvedValue({ source: {} as CanvasImageSource, ...dimensions, close }),
    encode: vi.fn().mockImplementation(async () => {
      const size = sizes[Math.min(encodeIndex, sizes.length - 1)];
      encodeIndex += 1;
      return new Blob([new Uint8Array(size)], { type: "image/webp" });
    }),
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

  it("iteratively reduces an oversized image until it meets the byte limit", async () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024)], "large.png", {
      type: "image/png",
    });
    const { runtime, close } = runtimeFor([4 * 1024 * 1024, 1_500_000]);

    const result = await optimizeImageFile(
      file,
      { maxDimension: 1920, quality: 0.8, maxBytes: 2 * 1024 * 1024 },
      runtime,
    );

    expect(result.type).toBe("image/webp");
    expect(result.size).toBe(1_500_000);
    expect(runtime.encode).toHaveBeenNthCalledWith(1, expect.anything(), 1920, 960, 0.8);
    expect(runtime.encode).toHaveBeenNthCalledWith(2, expect.anything(), 1290, 645, 0.74);
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects an oversized animated GIF without discarding its animation", async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "animation.gif", {
      type: "image/gif",
    });
    const { runtime } = runtimeFor(20);

    await expect(optimizeImageFile(file, {}, runtime)).rejects.toMatchObject({
      code: "animated_gif_too_large",
    });
    expect(runtime.decode).not.toHaveBeenCalled();
  });

  it("rejects unsupported file types before decoding", async () => {
    const file = new File([new Uint8Array(100)], "notes.pdf", { type: "application/pdf" });
    const { runtime } = runtimeFor(20);

    await expect(optimizeImageFile(file, {}, runtime)).rejects.toBeInstanceOf(
      ImageOptimizationError,
    );
    expect(runtime.decode).not.toHaveBeenCalled();
  });

  it("fails clearly and closes the decoded image when the target cannot be met", async () => {
    const file = new File([new Uint8Array(3 * 1024 * 1024)], "noise.png", {
      type: "image/png",
    });
    const { runtime, close } = runtimeFor(3 * 1024 * 1024);

    await expect(optimizeImageFile(file, {}, runtime)).rejects.toMatchObject({
      code: "cannot_meet_size",
    });
    expect(runtime.encode).toHaveBeenCalledTimes(8);
    expect(close).toHaveBeenCalledOnce();
  });
});
