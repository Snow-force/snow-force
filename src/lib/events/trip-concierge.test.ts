import { describe, expect, it } from "vitest";
import { seedEvents } from "./seed";
import {
  answerConciergeQuestion,
  answerConciergeTopic,
  conciergeGreeting,
  detectConciergeTopic,
  formatPaymentAmount,
} from "./trip-concierge";
import type { Event, EventDetailModule } from "../types";

const now = new Date("2026-11-01T12:00:00Z");
const base: Event = { ...seedEvents[0], registrationCloseAt: "2099-01-01T00:00:00Z", eventDate: "2099-01-10" };
const moduleRow = (type: EventDetailModule["type"], items: { en: string[]; zh: string[] }): EventDetailModule => ({
  id: `module-${type}`,
  type,
  displayMode: "list",
  title: { en: type, zh: type },
  content: { en: "", zh: "" },
  items,
});

describe("detectConciergeTopic", () => {
  it.each([
    ["How much does this trip cost?", "cost"],
    ["How much is the deposit?", "payment"],
    ["When can I cancel and get a refund?", "refund"],
    ["Where do we meet and what time?", "meet"],
    ["What should I bring? Can I rent gear?", "prepare"],
    ["I'm a beginner, is that ok?", "level"],
    ["Are there spots left?", "spots"],
    ["Can I talk to someone on WeChat?", "contact"],
    ["行程怎么安排？", "schedule"],
    ["费用多少钱？", "cost"],
    ["可以退款吗", "refund"],
    ["几点在哪里集合", "meet"],
    ["我是新手可以去吗", "level"],
    ["还有名额吗", "spots"],
  ])("routes %s to %s", (question, topic) => {
    expect(detectConciergeTopic(question)).toBe(topic);
  });

  it("matches Latin cues on word boundaries", () => {
    expect(detectConciergeTopic("Is there a freestyle park?")).toBeNull();
    expect(detectConciergeTopic("Is it free?")).toBe("cost");
  });

  it("returns null for empty or unrelated input", () => {
    expect(detectConciergeTopic("   ")).toBeNull();
    expect(detectConciergeTopic("what's your favorite color")).toBeNull();
  });
  it.each(["Is the deposit refundable?", "Can I refund my deposit?", "Can I cancel after paying the deposit?", "定金能退吗？", "交了押金还能取消吗？"])("prioritizes refund terms for mixed money questions: %s", (question) => {
    expect(detectConciergeTopic(question)).toBe("refund");
  });
});

describe("answerConciergeTopic", () => {
  it("answers cost from the listed fee and payment instructions only", () => {
    const answer = answerConciergeTopic(base, "cost", "en", now);
    expect(answer.lines[0]).toBe("The listed fee is Free.");
    expect(answer.lines[1]).toContain("Lift ticket and meals are self-paid");
    expect(answer.source?.section).toBe("costs");
  });

  it("formats a deposit in the event currency and explains Stripe checkout", () => {
    const event = { ...base, paymentModel: "deposit" as const, depositAmount: 99, depositCurrency: "usd" as const };
    expect(formatPaymentAmount(event, "en")).toBe("$99");
    expect(answerConciergeTopic(event, "payment", "en", now).lines[0]).toContain("$99 deposit");
    expect(answerConciergeTopic(event, "payment", "zh", now).lines[0]).toContain("定金");
  });

  it("says refund terms are unpublished instead of inventing them", () => {
    const answer = answerConciergeTopic({ ...base, allowCancellation: false }, "refund", "en", now);
    expect(answer.facts).toEqual([]);
    expect(answer.lines[0]).toMatch(/hasn't published refund terms/);
    expect(answer.lines[1]).toMatch(/Self-service cancellation isn't enabled/);
  });

  it("quotes published refund items", () => {
    const event = { ...base, detailModules: [...base.detailModules, moduleRow("refund", { en: ["Full refund until 7 days before"], zh: ["活动前7天可全额退款"] })] };
    expect(answerConciergeTopic(event, "refund", "zh", now).facts).toEqual(["活动前7天可全额退款"]);
  });

  it("gives meet logistics with a safe map link", () => {
    const answer = answerConciergeTopic(base, "meet", "en", now);
    expect(answer.facts.join("\n")).toContain("Meet time: 09:00");
    expect(answer.facts.join("\n")).toContain("Genting Snow Park main lodge");
    expect(answer.mapUrl).toMatch(/^https:\/\//);
    expect(answerConciergeTopic({ ...base, locationUrl: "javascript:alert(1)" }, "meet", "en", now).mapUrl).toBeUndefined();
  });

  it("falls back from itinerary to highlights for the plan", () => {
    const answer = answerConciergeTopic(base, "schedule", "en", now);
    expect(answer.lines[0]).toMatch(/isn't out yet/);
    expect(answer.facts).toContain("Group ride through selected terrain");
  });

  it("lists organizer notes for preparation", () => {
    expect(answerConciergeTopic(base, "prepare", "en", now).facts).toContain("Helmets are strongly recommended");
  });

  it("pulls level sentences and the form's level options", () => {
    const answer = answerConciergeTopic(base, "level", "en", now);
    expect(answer.facts.some((fact) => /level-based/i.test(fact))).toBe(true);
    expect(answer.footnote).toContain("Beginner / Intermediate / Advanced / Expert");
  });

  it("reports remaining spots, deadline, and closed state", () => {
    const open = answerConciergeTopic(base, "spots", "en", now);
    expect(open.lines[0]).toBe("Yes — 46 of 80 spots are still open.");
    expect(open.lines[1]).toMatch(/^Registration closes /);
    expect(open.footnote).toMatch(/loaded with this page/);
    const closed = answerConciergeTopic({ ...base, registrationState: "closed" }, "spots", "en", now);
    expect(closed.lines[0]).toMatch(/isn't open/);
    expect(closed.lines[1]).toMatch(/waitlist/);
    expect(answerConciergeTopic({ ...base, capacity: 0 }, "spots", "zh", now).lines[0]).toContain("不限名额");
  });

  it("hands off to humans with WeChat and email", () => {
    const answer = answerConciergeTopic(base, "contact", "en", now);
    expect(answer.facts).toContain("WeChat: SnowForceClub");
    expect(answer.email).toBe("hello@snow-force.com");
  });
  it("does not expose hidden paragraph content from an empty list module", () => {
    const refund = { ...moduleRow("refund", { en: [], zh: [] }), content: { en: "Hidden refund guarantee", zh: "隐藏的退款承诺" } };
    const answer = answerConciergeTopic({ ...base, detailModules: [refund] }, "refund", "en", now);
    expect(answer.facts).toEqual([]);
    expect(answer.followUps[0]).toBe("contact");
  });
  it("does not infer grouping or beginner eligibility from a form's level options", () => {
    const answer = answerConciergeTopic({ ...base, detailModules: [] }, "level", "en", now);
    expect(answer.facts).toEqual([]);
    expect(answer.footnote).toContain("Beginner / Intermediate / Advanced / Expert");
    expect(answer.footnote).not.toMatch(/plan groups|beginner-friendly|all levels welcome/i);
    expect(answer.footnote).toContain("does not establish");
    expect(answer.followUps[0]).toBe("contact");
  });
  it("cites preparation notes when they contain explicit level restrictions", () => {
    const answer = answerConciergeTopic({ ...base, detailModules: [moduleRow("notes", { en: ["Advanced riders only."], zh: ["仅限高级雪友。"] }), moduleRow("fees", { en: ["Beginner rental price: $50"], zh: ["初学装备租赁 $50"] })] }, "level", "en", now);
    expect(answer.facts).toEqual(["Advanced riders only."]);
    expect(answer.source?.section).toBe("prepare");
  });
  it("does not promise an approved place when describing a deposit", () => {
    const answer = answerConciergeTopic({ ...base, paymentModel: "deposit", depositAmount: 99, requiresApproval: true }, "payment", "en", now);
    expect(answer.lines.join(" ")).toMatch(/approval|review/i);
    expect(answer.lines.join(" ")).not.toMatch(/reserve your place|guarantee/i);
  });
  it("uses the supplied clock for availability and warns before describing closed payment", () => {
    const event = { ...base, registrationCloseAt: "2026-11-02T00:00:00Z" };
    expect(answerConciergeTopic(event, "spots", "en", now).lines[0]).toMatch(/^Yes/);
    const later = new Date("2026-11-03T00:00:00Z");
    expect(answerConciergeTopic(event, "spots", "en", later).lines[0]).toMatch(/isn't open/);
    expect(answerConciergeTopic(event, "payment", "en", later).lines.join(" ")).toMatch(/not.*open|closed/i);
  });
});

describe("answerConciergeQuestion and greeting", () => {
  it("admits when a question can't be matched and offers a human", () => {
    const answer = answerConciergeQuestion(base, "what's your favorite color", "en", now);
    expect(answer.topic).toBe("unknown");
    expect(answer.followUps).toContain("contact");
  });

  it("greets with a grounded snapshot in the rider's language", () => {
    const greeting = conciergeGreeting(base, "zh");
    expect(greeting.lines[0]).toContain("SnowForce 2026 雪季开板活动");
    expect(greeting.facts).toContain("费用: Free");
    expect(greeting.facts).toContain("剩余名额: 46/80");
    expect(greeting.followUps[0]).toBe("cost");
  });
});
