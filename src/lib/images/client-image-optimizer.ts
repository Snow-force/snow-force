const DEFAULT_MAX_DIMENSION = 2400;
const DEFAULT_QUALITY = 0.82;

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
};

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
  // Re-encoding GIFs would discard animation. Next.js can still serve them unchanged.
  if (file.type === "image/gif") return file;

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const decoded = await runtime.decode(file);

  try {
    const dimensions = calculateContainedDimensions(decoded.width, decoded.height, maxDimension);
    const encoded = await runtime.encode(decoded, dimensions.width, dimensions.height, quality);
    if (encoded.size >= file.size) return file;

    return new File([encoded], webpFileName(file.name), {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } finally {
    decoded.close?.();
  }
}
