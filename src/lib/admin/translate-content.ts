import { translateAdminItems } from "./translation";
import type { Bilingual, Event, EventRecap, FAQItem } from "../types";

type TranslationEntry = { id: string; value: string };

async function translate(entries: TranslationEntry[]) {
  const translated = new Map<string, string>();
  for (let index = 0; index < entries.length; index += 50) {
    const chunk = entries.slice(index, index + 50);
    if (chunk.length === 0) continue;
    const results = await translateAdminItems({ sourceLang: "en", targetLang: "zh", items: chunk });
    results.forEach((result) => translated.set(result.id, result.value));
  }
  return translated;
}

function text(entries: TranslationEntry[], id: string, value: Bilingual) {
  if (value.en.trim()) entries.push({ id, value: value.en });
}

function list(entries: TranslationEntry[], id: string, value: Bilingual<string[]>) {
  value.en.forEach((item, index) => {
    if (item.trim()) entries.push({ id: `${id}.${index}`, value: item });
  });
}

function translatedText(value: Bilingual, id: string, translations: Map<string, string>): Bilingual {
  return { en: value.en, zh: value.en.trim() ? (translations.get(id) ?? value.zh) : "" };
}

function translatedList(value: Bilingual<string[]>, id: string, translations: Map<string, string>): Bilingual<string[]> {
  return {
    en: value.en,
    zh: value.en.map((item, index) => item.trim() ? (translations.get(`${id}.${index}`) ?? value.zh[index] ?? "") : ""),
  };
}

export async function translateEventToChinese(event: Event): Promise<Event> {
  const entries: TranslationEntry[] = [];
  ["title", "meetLocation", "activityLocation", "paymentInstructions", "seoTitle", "seoDescription"]
    .forEach((key) => text(entries, `event.${key}`, event[key as keyof Event] as Bilingual));
  event.registrationQuestions.forEach((question) => {
    text(entries, `question.${question.id}.label`, question.label);
    text(entries, `question.${question.id}.helpText`, question.helpText);
    list(entries, `question.${question.id}.options`, question.options);
  });
  event.detailModules.forEach((module) => {
    text(entries, `module.${module.id}.title`, module.title);
    text(entries, `module.${module.id}.content`, module.content);
    list(entries, `module.${module.id}.items`, module.items);
  });
  if (event.merchantBoothProgram) {
    text(entries, "merchant.paymentInstructions", event.merchantBoothProgram.paymentInstructions);
    event.merchantBoothProgram.plans.forEach((plan) => {
      text(entries, `merchant.plan.${plan.id}.name`, plan.name);
      text(entries, `merchant.plan.${plan.id}.description`, plan.description);
    });
  }
  const translations = await translate(entries);
  return {
    ...event,
    title: translatedText(event.title, "event.title", translations),
    meetLocation: translatedText(event.meetLocation, "event.meetLocation", translations),
    activityLocation: translatedText(event.activityLocation, "event.activityLocation", translations),
    paymentInstructions: translatedText(event.paymentInstructions, "event.paymentInstructions", translations),
    seoTitle: translatedText(event.seoTitle, "event.seoTitle", translations),
    seoDescription: translatedText(event.seoDescription, "event.seoDescription", translations),
    registrationQuestions: event.registrationQuestions.map((question) => ({ ...question,
      label: translatedText(question.label, `question.${question.id}.label`, translations),
      helpText: translatedText(question.helpText, `question.${question.id}.helpText`, translations),
      options: translatedList(question.options, `question.${question.id}.options`, translations),
    })),
    detailModules: event.detailModules.map((module) => ({ ...module,
      title: translatedText(module.title, `module.${module.id}.title`, translations),
      content: translatedText(module.content, `module.${module.id}.content`, translations),
      items: translatedList(module.items, `module.${module.id}.items`, translations),
    })),
    merchantBoothProgram: event.merchantBoothProgram ? { ...event.merchantBoothProgram,
      paymentInstructions: translatedText(event.merchantBoothProgram.paymentInstructions, "merchant.paymentInstructions", translations),
      plans: event.merchantBoothProgram.plans.map((plan) => ({ ...plan,
        name: translatedText(plan.name, `merchant.plan.${plan.id}.name`, translations),
        description: translatedText(plan.description, `merchant.plan.${plan.id}.description`, translations),
      })),
    } : null,
  };
}

export async function translateRecapToChinese(recap: EventRecap): Promise<EventRecap> {
  const entries: TranslationEntry[] = [];
  ["title", "summary", "content", "location", "seoTitle", "seoDescription"]
    .forEach((key) => text(entries, `recap.${key}`, recap[key as keyof EventRecap] as Bilingual));
  list(entries, "recap.tags", recap.tags);
  recap.media.forEach((media) => {
    if (media.caption) text(entries, `media.${media.id}.caption`, { en: media.caption.en ?? "", zh: media.caption.zh ?? "" });
  });
  const translations = await translate(entries);
  return {
    ...recap,
    title: translatedText(recap.title, "recap.title", translations),
    summary: translatedText(recap.summary, "recap.summary", translations),
    content: translatedText(recap.content, "recap.content", translations),
    location: translatedText(recap.location, "recap.location", translations),
    seoTitle: translatedText(recap.seoTitle, "recap.seoTitle", translations),
    seoDescription: translatedText(recap.seoDescription, "recap.seoDescription", translations),
    tags: translatedList(recap.tags, "recap.tags", translations),
    media: recap.media.map((media) => media.caption ? ({ ...media, caption: translatedText({ en: media.caption.en ?? "", zh: media.caption.zh ?? "" }, `media.${media.id}.caption`, translations) }) : media),
  };
}

export async function translateFAQToChinese(faq: FAQItem): Promise<FAQItem> {
  const entries: TranslationEntry[] = [];
  text(entries, "faq.question", faq.question);
  text(entries, "faq.answer", faq.answer);
  text(entries, "faq.category", faq.category);
  const translations = await translate(entries);
  return {
    ...faq,
    question: translatedText(faq.question, "faq.question", translations),
    answer: translatedText(faq.answer, "faq.answer", translations),
    category: translatedText(faq.category, "faq.category", translations),
  };
}
