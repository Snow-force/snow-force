import {
  PUBLIC_IMAGE_ALLOWED_TYPES,
  PUBLIC_IMAGE_SOURCE_MAX_BYTES,
  PUBLIC_IMAGE_UPLOAD_MAX_BYTES,
} from "./public-image-policy";

const DEFAULT_MAX_DIMENSION = 2400;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MAX_ATTEMPTS = 8;
const MIN_QUALITY = 0.5;

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

export type ImageOptimizationRuntime = {
  decode(file: File): Promise<DecodedImage>;
  encode(image: DecodedImage, width: number, height: number, quality: number): Promise<Blob>;
};

export type OptimizeImageOptions = {
  maxDimension?: number;
  quality?: number;
  maxBytes?: number;
};

export type ImageOptimizationErrorCode =
  | "invalid_file"
  | "unsupported_type"
  | "source_too_large"
  | "animated_gif_too_large"
  | "cannot_meet_size";

export class ImageOptimizationError extends Error {
  constructor(
    public readonly code: ImageOptimizationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageOptimizationError";
  }
}

export function calculateContainedDimensions(width: number, height: number, maxDimension: number) {
  if (width <= maxDimension && height <= maxDimension) return { width, height };

  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function webpFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "") || "image";
  return `${withoutExtension}.webp`;
}

async function decodeInBrowser(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("The selected image could not be decoded."));
      element.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function encodeInBrowser(
  image: DecodedImage,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot optimize the selected image.");

  context.drawImage(image.source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", quality);
  });
  if (!blob) throw new Error("This browser could not encode the selected image.");
  return blob;
}

const browserRuntime: ImageOptimizationRuntime = {
  decode: decodeInBrowser,
  encode: encodeInBrowser,
};

export async function optimizeImageFile(
  file: File,
  options: OptimizeImageOptions = {},
  runtime: ImageOptimizationRuntime = browserRuntime,
): Promise<File> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const maxBytes = options.maxBytes ?? PUBLIC_IMAGE_UPLOAD_MAX_BYTES;

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new ImageOptimizationError("invalid_file", "Choose a non-empty image file.");
  }
  if (!PUBLIC_IMAGE_ALLOWED_TYPES.has(file.type)) {
    throw new ImageOptimizationError(
      "unsupported_type",
      "Use a JPG, PNG, WebP, or GIF image.",
    );
  }
  if (file.size > PUBLIC_IMAGE_SOURCE_MAX_BYTES) {
    throw new ImageOptimizationError(
      "source_too_large",
      "The source image must be 50 MB or smaller.",
    );
  }

  // Re-encoding GIFs would discard animation, so only already-compliant GIFs pass through.
  if (file.type === "image/gif") {
    if (file.size <= maxBytes) return file;
    throw new ImageOptimizationError(
      "animated_gif_too_large",
      "Animated GIFs cannot be compressed automatically and must be 2 MB or smaller.",
    );
  }

  const decoded = await runtime.decode(file);

  try {
    let dimensions = calculateContainedDimensions(decoded.width, decoded.height, maxDimension);
    let nextQuality = quality;

    for (let attempt = 0; attempt < DEFAULT_MAX_ATTEMPTS; attempt += 1) {
      const encoded = await runtime.encode(
        decoded,
        dimensions.width,
        dimensions.height,
        nextQuality,
      );

      if (encoded.size <= maxBytes) {
        if (encoded.size >= file.size) return file;
        return new File([encoded], webpFileName(file.name), {
          type: "image/webp",
          lastModified: file.lastModified,
        });
      }

      if (file.size <= maxBytes && encoded.size >= file.size) return file;
      if (attempt === DEFAULT_MAX_ATTEMPTS - 1) break;

      const targetScale = Math.sqrt(maxBytes / encoded.size) * 0.95;
      const scale = Math.min(0.9, Math.max(0.5, targetScale));
      dimensions = {
        width: Math.max(1, Math.round(dimensions.width * scale)),
        height: Math.max(1, Math.round(dimensions.height * scale)),
      };
      nextQuality = Number(Math.max(MIN_QUALITY, nextQuality - 0.06).toFixed(2));
    }

    throw new ImageOptimizationError(
      "cannot_meet_size",
      "The image could not be compressed below 2 MB. Choose a smaller source image.",
    );
  } finally {
    decoded.close?.();
  }
}
