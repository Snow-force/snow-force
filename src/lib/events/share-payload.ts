import "server-only";
import QRCode from "qrcode";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildShareUrl(origin: string, slug: string): string {
  if (!/^https?:\/\//.test(origin)) {
    throw new Error("origin must start with http:// or https://");
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`invalid slug: ${slug}`);
  }
  return `${origin}/events/${slug}`;
}

export async function buildQrCodeDataUrl(
  text: string
): Promise<{ dataUrl: string; width: number; height: number }> {
  const dataUrl = await QRCode.toDataURL(text, {
    margin: 1,
    width: 240,
    color: { dark: "#1d1d1f", light: "#ffffff" },
  });
  return { dataUrl, width: 240, height: 240 };
}
