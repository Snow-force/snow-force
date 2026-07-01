"use server";

import { buildShareUrl, buildQrCodeDataUrl } from "./share-payload";

export async function getQrCodeDataUrl(slug: string): Promise<{ dataUrl: string }> {
  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const url = buildShareUrl(origin, slug);
    const { dataUrl } = await buildQrCodeDataUrl(url);
    return { dataUrl };
  } catch {
    return { dataUrl: "" };
  }
}
