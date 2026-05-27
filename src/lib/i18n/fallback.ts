import type { Bilingual } from "@/lib/types";

export type SupportedLanguage = "zh" | "en";

export function localizedText(value: Bilingual, lang: SupportedLanguage) {
  return value[lang] || value.zh || value.en || "";
}

export function localizedList(value: Bilingual<string[]>, lang: SupportedLanguage) {
  const preferred = value[lang];
  if (preferred.length > 0) return preferred;
  if (value.zh.length > 0) return value.zh;
  return value.en;
}
