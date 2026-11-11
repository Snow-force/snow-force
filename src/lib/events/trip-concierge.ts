import { getEventAvailabilitySnapshot } from "./availability";
import { generalContactEmail } from "../contact";
import type { Lang } from "../language";
import type { Bilingual, Event, EventDetailModule, EventDetailModuleType } from "../types";

/**
 * Trip concierge: answers a rider's pre-registration questions using only the
 * organizer's published event fields. It never invents logistics — when the
 * organizer has not published something, it says so and hands off to a human.
 */

export const conciergeTopics = [
  "cost",
  "payment",
  "refund",
  "meet",
  "schedule",
  "prepare",
  "level",
  "spots",
  "contact",
] as const;

export type ConciergeTopic = (typeof conciergeTopics)[number];
export type BriefingSection = "plan" | "prepare" | "costs";

export type ConciergeAnswer = {
  topic: ConciergeTopic | "unknown";
  /** One chat bubble per entry, already localized. */
  lines: string[];
  /** Published facts quoted from the organizer, rendered as a compact list. */
  facts: string[];
  /** Short follow-on context shown after the facts. */
  footnote?: string;
  /** Where the rider can verify the answer on the page. */
  source?: { section: BriefingSection | "registration"; label: string };
  mapUrl?: string;
  email?: string;
  followUps: ConciergeTopic[];
};

const chipLabels: Record<ConciergeTopic, Bilingual> = {
  cost: { en: "How much is it?", zh: "费用多少？" },
  payment: { en: "How do I pay?", zh: "怎么付款？" },
  refund: { en: "Can I cancel?", zh: "可以取消吗？" },
  meet: { en: "When & where do we meet?", zh: "几点在哪集合？" },
  schedule: { en: "What's the plan?", zh: "行程怎么安排？" },
  prepare: { en: "What should I bring?", zh: "需要带什么？" },
  level: { en: "Is it OK for beginners?", zh: "新手可以参加吗？" },
  spots: { en: "Are spots left?", zh: "还有名额吗？" },
  contact: { en: "Talk to a person", zh: "联系真人领队" },
};

export function conciergeChipLabel(topic: ConciergeTopic, lang: Lang): string {
  return chipLabels[topic][lang];
}

/** Keyword cues per topic, in both languages. Order of `conciergeTopics` breaks ties. */
const cues: Record<ConciergeTopic, string[]> = {
  refund: ["refund", "refundable", "non-refundable", "cancel", "cancellation", "money back", "deposit back", "get it back", "withdraw", "退款", "取消", "退费", "退钱", "退定金", "退订金", "退押金", "能退", "可退", "退出", "不去了"],
  payment: ["deposit", "pay", "payment", "stripe", "card", "venmo", "zelle", "定金", "订金", "押金", "付款", "支付", "付钱", "尾款", "转账"],
  cost: ["cost", "price", "fee", "how much", "include", "expensive", "cheap", "$", "free", "多少钱", "费用", "价格", "价钱", "包含", "包括", "收费", "免费", "贵"],
  meet: ["meet", "where", "when", "what time", "start", "address", "location", "parking", "map", "date", "集合", "几点", "哪里", "哪儿", "地点", "地址", "时间", "停车", "日期", "在哪", "出发"],
  schedule: ["schedule", "itinerary", "plan", "agenda", "program", "what do we do", "行程", "安排", "日程", "流程", "活动内容"],
  prepare: ["bring", "gear", "equipment", "rent", "rental", "helmet", "wear", "pack", "packing", "prepare", "preparation", "clothes", "带", "装备", "租", "头盔", "准备", "穿", "衣服", "雪具"],
  level: ["beginner", "level", "first time", "first-time", "never", "skill", "intermediate", "advanced", "newbie", "lesson", "coach", "新手", "水平", "第一次", "零基础", "不会", "初学", "教学", "进阶", "高级", "教练", "小白"],
  spots: ["spot", "full", "space", "capacity", "left", "waitlist", "deadline", "close", "still open", "available", "名额", "满了", "还有", "候补", "截止", "剩", "还能报"],
  contact: ["contact", "wechat", "human", "person", "organizer", "phone", "email", "talk", "someone", "联系", "微信", "客服", "领队", "主办", "电话", "邮箱", "真人"],
};

/** Money-and-commitment topics outrank general ones when both appear in a question. */
const topicWeight: Partial<Record<ConciergeTopic, number>> = { refund: 1.5, payment: 1.3 };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cueMatches(text: string, cue: string): boolean {
  // Latin words match on word boundaries (so "free" ≠ "freestyle"); CJK and symbols match as substrings.
  if (/^[a-z][a-z' -]*$/.test(cue)) {
    return new RegExp(`\\b${escapeRegExp(cue)}(?:s|es|ed|ing)?\\b`).test(text);
  }
  return text.includes(cue);
}

export function detectConciergeTopic(question: string): ConciergeTopic | null {
  const normalized = question.toLocaleLowerCase().trim();
  if (!normalized) return null;
  // A question about cancellation must not become an instruction to pay a deposit.
  if (cues.refund.some((cue) => cueMatches(normalized, cue))) return "refund";
  let best: { topic: ConciergeTopic; score: number } | null = null;
  for (const topic of conciergeTopics) {
    const raw = cues[topic].reduce((total, cue) => (cueMatches(normalized, cue) ? total + cue.length : total), 0);
    const score = raw * (topicWeight[topic] ?? 1);
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }
  return best?.topic ?? null;
}

export function answerConciergeQuestion(event: Event, question: string, lang: Lang, now = new Date()): ConciergeAnswer {
  const topic = detectConciergeTopic(question);
  if (topic) return answerConciergeTopic(event, topic, lang, now);
  return {
    topic: "unknown",
    lines: [
      pick(lang, {
        en: "I only answer from what the organizer has published for this trip, and I couldn't match that question.",
        zh: "我只根据主办方为这场活动公开的信息回答，这个问题我暂时匹配不到。",
      }),
      pick(lang, {
        en: "Try one of these, or reach a real trip lead:",
        zh: "可以试试下面的问题，或者直接联系真人领队：",
      }),
    ],
    facts: [],
    followUps: ["cost", "meet", "prepare", "contact"],
  };
}

export function answerConciergeTopic(event: Event, topic: ConciergeTopic, lang: Lang, now = new Date()): ConciergeAnswer {
  const L = (value: Bilingual) => pick(lang, value);
  const text = (value: Bilingual) => localized(value, lang);
  const notPublished = (what: Bilingual): string =>
    L({
      en: `The organizer hasn't published ${what.en} yet — a trip lead can confirm it for you.`,
      zh: `主办方还没有公布${what.zh}，可以让领队帮你确认。`,
    });
  const costs = { section: "costs" as const, label: L({ en: "Costs & terms", zh: "费用与规则" }) };
  const plan = { section: "plan" as const, label: L({ en: "The plan", zh: "行程安排" }) };
  const prepare = { section: "prepare" as const, label: L({ en: "Get ready", zh: "出发准备" }) };
  const registration = { section: "registration" as const, label: L({ en: "Registration", zh: "报名" }) };

  switch (topic) {
    case "cost": {
      const fees = moduleFacts(event, ["fees"], lang);
      const instructions = text(event.paymentInstructions);
      const lines = [
        event.feeAmount
          ? L({ en: `The listed fee is ${event.feeAmount}.`, zh: `活动标价：${event.feeAmount}。` })
          : notPublished({ en: "a fee", zh: "活动费用" }),
      ];
      if (instructions) lines.push(instructions);
      return { topic, lines, facts: fees, source: costs, followUps: event.feeAmount ? ["payment", "refund", "spots"] : ["contact", "payment", "refund"] };
    }
    case "payment": {
      const amount = formatPaymentAmount(event, lang);
      const lines: string[] = [];
      if (!getEventAvailabilitySnapshot(event, now).open) lines.push(L({ en: "Registration is not currently open. Confirm with the organizer before making a payment.", zh: "报名目前未开放，请先向主办方确认，再进行付款。" }));
      if (event.paymentModel === "free") {
        lines.push(L({ en: "No online payment is taken when you register for this trip.", zh: "报名这场活动时无需在线付款。" }));
      } else if (event.paymentModel === "deposit") {
        lines.push(
          amount
            ? L({ en: `This trip uses a ${amount} deposit, paid by card through Stripe during registration.`, zh: `这场活动在报名流程中通过 Stripe 用银行卡收取 ${amount} 定金。` })
            : notPublished({ en: "the exact deposit amount", zh: "确切的定金金额" }),
        );
      } else {
        lines.push(
          amount
            ? L({ en: `Full payment of ${amount} is taken by card through Stripe during registration.`, zh: `这场活动在报名流程中通过 Stripe 用银行卡收取全款 ${amount}。` })
            : notPublished({ en: "the exact full-payment amount", zh: "确切的全款金额" }),
        );
      }
      const instructions = text(event.paymentInstructions);
      if (instructions) lines.push(instructions);
      if (event.requiresApproval) lines.push(L({ en: "Organizer approval is required before registration is confirmed.", zh: "报名确认还需主办方审核。" }));
      return { topic, lines, facts: [], source: costs, followUps: ["refund", "cost", "spots"] };
    }
    case "refund": {
      const refund = moduleFacts(event, ["refund"], lang);
      const lines: string[] = [];
      if (refund.length) {
        lines.push(L({ en: "Here are the organizer's cancellation and refund terms:", zh: "主办方公布的取消与退款规则如下：" }));
      } else {
        lines.push(notPublished({ en: "refund terms", zh: "退款规则" }));
      }
      lines.push(
        event.allowCancellation
          ? L({ en: "Registered riders can request a cancellation from their member account.", zh: "已报名的雪友可以在会员账号中申请取消。" })
          : L({ en: "Self-service cancellation isn't enabled for this trip, so please contact the organizer.", zh: "此活动未开放自助取消，如需取消请联系主办方。" }),
      );
      return { topic, lines, facts: refund, source: costs, followUps: refund.length ? ["payment", "contact"] : ["contact", "payment"] };
    }
    case "meet": {
      const when = formatEventDate(event.eventDate, lang);
      const where = text(event.meetLocation);
      const facts = [
        `${L({ en: "Date", zh: "日期" })}: ${when ?? L({ en: "to be announced", zh: "待公布" })}`,
        `${L({ en: "Meet time", zh: "集合时间" })}: ${event.meetTime || L({ en: "to be announced", zh: "待公布" })}`,
        `${L({ en: "Meet point", zh: "集合地点" })}: ${where || L({ en: "to be announced", zh: "待公布" })}`,
        `${L({ en: "Mountain", zh: "雪场" })}: ${text(event.activityLocation) || L({ en: "to be announced", zh: "待公布" })}`,
      ];
      return {
        topic,
        lines: [L({ en: "Here's where the crew comes together:", zh: "集合信息如下：" })],
        facts,
        source: plan,
        mapUrl: /^https?:\/\//i.test(event.locationUrl) ? event.locationUrl : undefined,
        followUps: when && event.meetTime && where ? ["schedule", "prepare", "spots"] : ["contact", "schedule", "prepare"],
      };
    }
    case "schedule": {
      const itinerary = moduleFacts(event, ["itinerary"], lang);
      const highlights = moduleFacts(event, ["highlights"], lang);
      const facts = itinerary.length ? itinerary : highlights;
      return {
        topic,
        lines: [
          itinerary.length
            ? L({ en: "Here's the published itinerary:", zh: "已公布的行程安排：" })
            : highlights.length
              ? L({ en: "A detailed itinerary isn't out yet, but here's what's planned:", zh: "详细行程暂未公布，目前计划的亮点有：" })
              : notPublished({ en: "an itinerary", zh: "详细行程" }),
        ],
        facts,
        source: plan,
        followUps: facts.length ? ["meet", "prepare", "level"] : ["contact", "meet", "prepare"],
      };
    }
    case "prepare": {
      const notes = moduleFacts(event, ["notes"], lang);
      return {
        topic,
        lines: [
          notes.length
            ? L({ en: "The organizer asks riders to check these before the trip:", zh: "主办方提醒出发前确认以下事项：" })
            : notPublished({ en: "a packing or preparation list", zh: "装备与准备清单" }),
        ],
        facts: notes,
        source: prepare,
        followUps: notes.length ? ["level", "meet", "cost"] : ["contact", "level", "meet"],
      };
    }
    case "level": {
      const evidence = levelMentions(event, lang);
      const mentions = evidence.facts;
      const levelQuestion = event.registrationQuestions.find((question) => question.key === "level");
      const levelOptions = levelQuestion ? localizedList(levelQuestion.options, lang) : [];
      const lines = [
        mentions.length
          ? L({ en: "Here's what the organizer says about riding level:", zh: "主办方关于水平的说明：" })
          : notPublished({ en: "a recommended riding level", zh: "建议的滑雪水平" }),
      ];
      const footnote = levelOptions.length
        ? L({
            en: `The registration form lists these riding levels: ${levelOptions.join(" / ")}. This does not establish which levels are suitable for this trip.`,
            zh: `报名表列出了这些水平选项：${levelOptions.join(" / ")}。选项本身不代表这场活动适合哪些水平。`,
          })
        : undefined;
      return { topic, lines, facts: mentions, footnote, source: mentions.length ? evidence.section === "prepare" ? prepare : plan : registration, followUps: mentions.length ? ["prepare", "schedule", "contact"] : ["contact", "prepare", "schedule"] };
    }
    case "spots": {
      const availability = getEventAvailabilitySnapshot(event, now);
      const closeAt = event.registrationCloseAt ? new Date(event.registrationCloseAt) : null;
      const closeText = closeAt && !Number.isNaN(closeAt.getTime()) ? formatDateTime(closeAt, lang) : null;
      const lines: string[] = [];
      if (availability.open) {
        lines.push(
          availability.remaining === undefined
            ? L({ en: "Yes — registration is open and there's no set cap.", zh: "可以报名，这场活动不限名额。" })
            : L({ en: `Yes — ${availability.remaining} of ${event.capacity} spots are still open.`, zh: `可以报名，${event.capacity} 个名额中还剩 ${availability.remaining} 个。` }),
        );
        if (closeText && closeAt && closeAt > now) {
          lines.push(L({ en: `Registration closes ${closeText}.`, zh: `报名截止时间：${closeText}。` }));
        }
        if (event.requiresApproval) {
          lines.push(L({ en: "Each registration is reviewed by the organizer before it's confirmed.", zh: "每份报名需主办方审核后才会确认。" }));
        }
      } else {
        lines.push(L({ en: "Registration isn't open for this trip right now.", zh: "这场活动目前不在报名中。" }));
        if (event.allowWaitlist) {
          lines.push(L({ en: "This event's settings allow a waitlist. Confirm with the organizer whether it is still accepting riders.", zh: "活动配置允许候补，目前是否仍接受候补请向主办方确认。" }));
        }
      }
      return { topic, lines, facts: [], footnote: L({ en: "These details were loaded with this page. Final availability is checked when you register.", zh: "这些信息来自本次页面加载，最终名额以报名时核验结果为准。" }), source: registration, followUps: availability.open ? ["payment", "level", "meet"] : ["contact", "meet"] };
    }
    case "contact": {
      const contact = moduleFacts(event, ["contact"], lang);
      return {
        topic,
        lines: [
          L({ en: "Real trip leads are happy to help — reach them here:", zh: "真人领队很乐意帮忙，可以通过这些方式联系：" }),
        ],
        facts: [...contact, L({ en: "WeChat: SnowForceClub", zh: "微信：SnowForceClub" })],
        email: generalContactEmail,
        followUps: ["cost", "meet", "spots"],
      };
    }
  }
}

/** Opening message: a one-glance trip summary grounded in the event fields. */
export function conciergeGreeting(event: Event, lang: Lang, now = new Date()): ConciergeAnswer {
  const L = (value: Bilingual) => pick(lang, value);
  const title = localized(event.title, lang);
  const when = formatEventDate(event.eventDate, lang);
  const availability = getEventAvailabilitySnapshot(event, now);
  const facts = [
    when ? `${L({ en: "When", zh: "时间" })}: ${when}${event.meetTime ? ` · ${event.meetTime}` : ""}` : "",
    localized(event.activityLocation, lang) ? `${L({ en: "Where", zh: "地点" })}: ${localized(event.activityLocation, lang)}` : "",
    event.feeAmount ? `${L({ en: "Fee", zh: "费用" })}: ${event.feeAmount}` : "",
    availability.open
      ? availability.remaining === undefined
        ? L({ en: "Spots: open, no cap", zh: "名额：开放，不限人数" })
        : `${L({ en: "Spots left", zh: "剩余名额" })}: ${availability.remaining}/${event.capacity}`
      : L({ en: "Registration: closed", zh: "报名：已关闭" }),
  ].filter(Boolean);
  return {
    topic: "unknown",
    lines: [
      L({
        en: `Hi! I'm the SnowForce trip desk for ${title}. Ask me anything before you sign up — I only answer from what the organizer has published.`,
        zh: `你好！我是「${title}」的 SnowForce 行程助手。报名前有任何疑问都可以问我——我只根据主办方公开的信息回答。`,
      }),
    ],
    facts,
    followUps: availability.open ? ["cost", "level", "prepare", "spots"] : ["meet", "spots", "contact"],
  };
}

function pick(lang: Lang, value: Bilingual): string {
  return value[lang];
}

function localized(value: Bilingual, lang: Lang): string {
  return (lang === "en" ? value.en || value.zh : value.zh || value.en).trim();
}

function localizedList(value: Bilingual<string[]>, lang: Lang): string[] {
  const primary = lang === "en" ? value.en : value.zh;
  const fallback = lang === "en" ? value.zh : value.en;
  return (primary.length ? primary : fallback).map((item) => item.trim()).filter(Boolean);
}

function moduleText(row: EventDetailModule, lang: Lang): string[] {
  if (row.displayMode === "list") {
    return localizedList(row.items, lang);
  }
  const content = localized(row.content, lang);
  return content
    ? content
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function moduleFacts(event: Event, types: EventDetailModuleType[], lang: Lang): string[] {
  return event.detailModules.filter((row) => types.includes(row.type)).flatMap((row) => moduleText(row, lang));
}

const levelCues = /beginner|\blevel|first[- ]time|intermediate|advanced|lesson|coach|新手|零基础|初学|各水平|所有水平|不同水平|第一次|教学|教练|进阶|高级|分组/i;

function levelMentions(event: Event, lang: Lang): { facts: string[]; section: "prepare" | "plan" } {
  for (const section of ["prepare", "plan"] as const) {
    const types = section === "prepare" ? ["notes"] : ["overview", "highlights", "itinerary"];
    const sentences = event.detailModules
      .filter((row) => types.includes(row.type))
      .flatMap((row) => moduleText(row, lang))
      .flatMap((line) => line.split(/(?<=[.!?。！？])\s*/))
      .map((line) => line.trim())
      .filter((line) => line && levelCues.test(line));
    if (sentences.length) return { facts: [...new Set(sentences)].slice(0, 4), section };
  }
  return { facts: [], section: "prepare" as const };
}

function formatEventDate(value: string, lang: Lang): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: Date, lang: Lang): string {
  return value.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatPaymentAmount(event: Event, lang: Lang): string | null {
  const amount = event.paymentModel === "deposit" ? event.depositAmount : event.paymentModel === "full_prepay" ? event.fullPaymentAmount : null;
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US", {
      style: "currency",
      currency: event.depositCurrency.toUpperCase(),
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${event.depositCurrency.toUpperCase()}`;
  }
}

/** Window event the event briefing listens for, so the concierge can open the section that backs an answer. */
export const briefingSectionEvent = "snowforce:briefing-section";

export function requestBriefingSection(section: BriefingSection): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<BriefingSection>(briefingSectionEvent, { detail: section }));
}
