import { createHash } from "node:crypto";
import { MEDIA_WIDTHS, MEDIA_VERSION, publicMediaSource, type MediaWidth } from "@/lib/images/delivery-policy";
import { publicVariants } from "@/lib/images/variant-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = publicMediaSource(params.get("src") ?? "", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const width = Number(params.get("w"));
  if (!source || !MEDIA_WIDTHS.includes(width as MediaWidth) || params.get("v") !== MEDIA_VERSION || [...params.keys()].length !== 3) {
    return new Response("Invalid public image request", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await publicVariants.get(source, width as MediaWidth);
    const etag = `"${createHash("sha256").update(result.data).digest("hex")}"`;
    const headers = { "Content-Type": "image/webp", "Content-Length": String(result.data.length), "Cache-Control": "public, max-age=31536000, immutable", "ETag": etag, "X-Content-Type-Options": "nosniff", "X-Snowforce-Media-Cache": result.cache };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(result.data), { headers });
  } catch {
    return new Response("Image preview temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
}
