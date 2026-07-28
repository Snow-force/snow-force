import fs from "node:fs";
import path from "node:path";

const root = "C:/Project/snow-force";
const outDir = path.join(root, "oldversion content");
const imageDir = path.join(outDir, "images");
const archiveUrl = "https://web.archive.org/web/20250305002148id_/https://snow-force.com/";

function normalizeUrl(value) {
  if (!value) return null;
  let url = value.replace(/&amp;/g, "&").trim();
  if (url.startsWith("//")) url = `https:${url}`;
  if (url.startsWith("/")) url = `https://web.archive.org${url}`;
  return url;
}

function safeFileName(url, index) {
  const clean = url
    .split("?")[0]
    .replace(/https?:\/\//g, "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/%20/g, "_")
    .replace(/_+$/g, "");
  const extMatch = clean.match(/\.(png|jpe?g|gif|webp|ico)(?:_|$)/i);
  const ext = extMatch ? `.${extMatch[1].toLowerCase().replace("jpeg", "jpg")}` : ".jpg";
  return `${String(index + 1).padStart(2, "0")}-${clean.slice(-90).replace(/^_+/, "")}${ext}`;
}

function collectImageUrls(html) {
  const urls = [];
  const patterns = [
    /src="([^"]+\.(?:png|jpg|jpeg|gif|webp|ico)[^"]*)"/gi,
    /srcSet="([^"]+)"/g,
    /data-srclazy="([^"]+)"/g,
    /href="([^"]+\.(?:png|jpg|jpeg|gif|webp|ico)[^"]*)"/gi,
    /content="([^"]+\.(?:png|jpg|jpeg|gif|webp|ico)[^"]*)"/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const parts = match[1].split(",").map((part) => part.trim().split(/\s+/)[0]);
      for (const part of parts) urls.push(normalizeUrl(part));
    }
  }

  return [
    ...new Set(
      urls
        .filter(Boolean)
        .filter((url) => !url.startsWith("data:"))
        .filter((url) => !/transparent_placeholder|polyfill|min\.js|\.css|script\.js|player\.vimeo\.com\/video/i.test(url)),
    ),
  ];
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const response = await fetch(archiveUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch ${archiveUrl}: ${response.status}`);
}

const html = await response.text();
fs.writeFileSync(path.join(outDir, "old-site-2025.html"), html);
fs.writeFileSync(path.join(outDir, "old-site-text-2025.txt"), extractText(html));

const manifest = [];
const imageUrls = collectImageUrls(html);
for (let index = 0; index < imageUrls.length; index += 1) {
  const url = imageUrls[index];
  const fileName = safeFileName(url, index);
  try {
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) throw new Error(`HTTP ${imageResponse.status}`);
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    fs.writeFileSync(path.join(imageDir, fileName), bytes);
    manifest.push({ file: `images/${fileName}`, url, bytes: bytes.length, status: "downloaded" });
  } catch (error) {
    manifest.push({ file: null, url, status: "failed", error: String(error.message || error) });
  }
}

fs.writeFileSync(path.join(outDir, "image-manifest.json"), JSON.stringify(manifest, null, 2));

console.log(
  JSON.stringify(
    {
      htmlBytes: html.length,
      textBytes: extractText(html).length,
      images: manifest.filter((item) => item.status === "downloaded").length,
      failed: manifest.filter((item) => item.status === "failed").length,
    },
    null,
    2,
  ),
);
