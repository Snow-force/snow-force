"use client";

import type { AdminTranslationItem, AdminTranslationLang, AdminTranslationResult } from "@/lib/admin/translation";
import type { Bilingual, Event, EventDetailModule, EventRecap, EventRegistrationQuestion } from "@/lib/types";

type EventBilingualKey =
  | "title"
  | "meetLocation"
  | "activityLocation"
  | "paymentInstructions"
  | "seoTitle"
  | "seoDescription";
type QuestionBilingualKey = "label" | "helpText";
type QuestionListKey = "options";
type ModuleBilingualKey = "title" | "content";
type ModuleListKey = "items";
type RecapBilingualKey = "title" | "summary" | "content" | "location" | "seoTitle" | "seoDescription";
type RecapListKey = "tags";

const eventBilingualKeys: EventBilingualKey[] = [
  "title",
  "meetLocation",
  "activityLocation",
  "paymentInstructions",
  "seoTitle",
  "seoDescription",
];

const questionBilingualKeys: QuestionBilingualKey[] = ["label", "helpText"];
const questionListKeys: QuestionListKey[] = ["options"];
const moduleBilingualKeys: ModuleBilingualKey[] = ["title", "content"];
const moduleListKeys: ModuleListKey[] = ["items"];
const recapContentBilingualKeys: RecapBilingualKey[] = [
  "title",
  "summary",
  "content",
  "location",
];
const recapSeoBilingualKeys: RecapBilingualKey[] = [
  "seoTitle",
  "seoDescription",
];
const recapListKeys: RecapListKey[] = ["tags"];

function hasText(value: string) {
  return value.trim().length > 0;
}

function shouldTranslate(source: string, target: string) {
  return hasText(source) && !hasText(target);
}

function stringItem(id: string, value: Bilingual, sourceLang: AdminTranslationLang, targetLang: AdminTranslationLang) {
  return shouldTranslate(value[sourceLang], value[targetLang]) ? { id, value: value[sourceLang] } : undefined;
}

function listItems(
  idPrefix: string,
  value: Bilingual<string[]>,
  sourceLang: AdminTranslationLang,
  targetLang: AdminTranslationLang,
) {
  return value[sourceLang].flatMap((sourceValue, index) => {
    const targetValue = value[targetLang][index] ?? "";
    return shouldTranslate(sourceValue, targetValue) ? [{ id: `${idPrefix}.${index}`, value: sourceValue }] : [];
  });
}

function compactItems(items: Array<AdminTranslationItem | undefined>) {
  return items.filter((item): item is AdminTranslationItem => Boolean(item));
}

function translationMap(translations: AdminTranslationResult[]) {
  return new Map(translations.map((translation) => [translation.id, translation.value]));
}

function applyStringTranslation(value: Bilingual, targetLang: AdminTranslationLang, translatedValue: string | undefined) {
  if (!translatedValue || hasText(value[targetLang])) return value;
  return { ...value, [targetLang]: translatedValue };
}

function applyListTranslations(
  value: Bilingual<string[]>,
  targetLang: AdminTranslationLang,
  idPrefix: string,
  translations: Map<string, string>,
) {
  const nextTarget = [...value[targetLang]];
  for (const [id, translatedValue] of Array.from(translations.entries())) {
    if (!id.startsWith(`${idPrefix}.`)) continue;
    const index = Number(id.slice(idPrefix.length + 1));
    if (!Number.isInteger(index) || index < 0 || hasText(nextTarget[index] ?? "")) continue;
    nextTarget[index] = translatedValue;
  }
  return { ...value, [targetLang]: nextTarget };
}

export function collectEventTranslationItems(
  event: Event,
  sourceLang: AdminTranslationLang,
  targetLang: AdminTranslationLang,
): AdminTranslationItem[] {
  const baseItems = compactItems(
    eventBilingualKeys.map((key) => stringItem(`event.${String(key)}`, event[key], sourceLang, targetLang)),
  );

  const questionItems = event.registrationQuestions.flatMap((question) => [
    ...compactItems(
      questionBilingualKeys.map((key) =>
        stringItem(`event.registrationQuestions.${question.id}.${String(key)}`, question[key], sourceLang, targetLang),
      ),
    ),
    ...questionListKeys.flatMap((key) =>
      listItems(`event.registrationQuestions.${question.id}.${String(key)}`, question[key], sourceLang, targetLang),
    ),
  ]);

  const moduleItems = event.detailModules.flatMap((moduleItem) => [
    ...compactItems(
      moduleBilingualKeys.map((key) =>
        stringItem(`event.detailModules.${moduleItem.id}.${String(key)}`, moduleItem[key], sourceLang, targetLang),
      ),
    ),
    ...moduleListKeys.flatMap((key) =>
      listItems(`event.detailModules.${moduleItem.id}.${String(key)}`, moduleItem[key], sourceLang, targetLang),
    ),
  ]);

  return [...baseItems, ...questionItems, ...moduleItems];
}

export function applyEventTranslations(
  event: Event,
  targetLang: AdminTranslationLang,
  translations: AdminTranslationResult[],
): Event {
  const translated = translationMap(translations);
  return {
    ...event,
    ...Object.fromEntries(
      eventBilingualKeys.map((key) => [
        key,
        applyStringTranslation(event[key], targetLang, translated.get(`event.${String(key)}`)),
      ]),
    ),
    registrationQuestions: event.registrationQuestions.map((question) => ({
      ...question,
      ...Object.fromEntries(
        questionBilingualKeys.map((key) => [
          key,
          applyStringTranslation(
            question[key],
            targetLang,
            translated.get(`event.registrationQuestions.${question.id}.${String(key)}`),
          ),
        ]),
      ),
      ...Object.fromEntries(
        questionListKeys.map((key) => [
          key,
          applyListTranslations(question[key], targetLang, `event.registrationQuestions.${question.id}.${String(key)}`, translated),
        ]),
      ),
    })),
    detailModules: event.detailModules.map((moduleItem) => ({
      ...moduleItem,
      ...Object.fromEntries(
        moduleBilingualKeys.map((key) => [
          key,
          applyStringTranslation(
            moduleItem[key],
            targetLang,
            translated.get(`event.detailModules.${moduleItem.id}.${String(key)}`),
          ),
        ]),
      ),
      ...Object.fromEntries(
        moduleListKeys.map((key) => [
          key,
          applyListTranslations(moduleItem[key], targetLang, `event.detailModules.${moduleItem.id}.${String(key)}`, translated),
        ]),
      ),
    })),
  };
}

export function collectRecapTranslationItems(
  recap: EventRecap,
  sourceLang: AdminTranslationLang,
  targetLang: AdminTranslationLang,
): AdminTranslationItem[] {
  return [
    ...compactItems(
      recapContentBilingualKeys.map((key) => stringItem(`recap.${String(key)}`, recap[key], sourceLang, targetLang)),
    ),
    ...recapListKeys.flatMap((key) => listItems(`recap.${String(key)}`, recap[key], sourceLang, targetLang)),
    ...compactItems(recapSeoBilingualKeys.map((key) => stringItem(`recap.${String(key)}`, recap[key], sourceLang, targetLang))),
  ];
}

export function applyRecapTranslations(
  recap: EventRecap,
  targetLang: AdminTranslationLang,
  translations: AdminTranslationResult[],
): EventRecap {
  const translated = translationMap(translations);
  return {
    ...recap,
    ...Object.fromEntries(
      [...recapContentBilingualKeys, ...recapSeoBilingualKeys].map((key) => [
        key,
        applyStringTranslation(recap[key], targetLang, translated.get(`recap.${String(key)}`)),
      ]),
    ),
    ...Object.fromEntries(
      recapListKeys.map((key) => [key, applyListTranslations(recap[key], targetLang, `recap.${String(key)}`, translated)]),
    ),
  };
}
