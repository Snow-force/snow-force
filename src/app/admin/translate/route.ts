import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import {
  translateAdminItems,
  TranslationError,
  type AdminTranslationItem,
  type AdminTranslationLang,
} from "@/lib/admin/translation";

const maxItems = 50;

function isLang(value: unknown): value is AdminTranslationLang {
  return value === "zh" || value === "en";
}

function isItem(value: unknown): value is AdminTranslationItem {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { value?: unknown }).value === "string"
  );
}

async function readPayload(request: Request) {
  const payload = (await request.json()) as unknown;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const sourceLang = (payload as { sourceLang?: unknown }).sourceLang;
  const targetLang = (payload as { targetLang?: unknown }).targetLang;
  const items = (payload as { items?: unknown }).items;
  if (!isLang(sourceLang) || !isLang(targetLang) || !Array.isArray(items) || items.length > maxItems || !items.every(isItem)) {
    return undefined;
  }
  return { sourceLang, targetLang, items };
}

export async function POST(request: Request) {
  await requireAdmin();

  const payload = await readPayload(request);
  if (!payload) {
    return NextResponse.json({ message: "Invalid translation request." }, { status: 400 });
  }

  try {
    const translations = await translateAdminItems(payload);
    return NextResponse.json({ translations });
  } catch (error) {
    if (error instanceof TranslationError) {
      const status = error.code === "invalid_request" ? 400 : error.code === "missing_key" ? 503 : 502;
      return NextResponse.json({ message: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ message: "Translation failed." }, { status: 502 });
  }
}
