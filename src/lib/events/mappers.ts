import type {
  Event,
  EventDetailDisplayMode,
  EventDetailModuleType,
  EventMerchantBoothPhysicalBooth,
  EventMerchantBoothPlan,
  EventMerchantBoothProgram,
  EventQuestionType,
  MerchantBoothCurrency,
} from "@/lib/types";
import { ensureRequiredRegistrationQuestions } from "./required-registration-questions";

export type EventCoreRow = {
  slug: string;
  status: Event["status"];
  registration_state: Event["registrationState"];
  title_zh: string;
  title_en: string;
  summary_zh?: string;
  summary_en?: string;
  event_date: string | null;
  meet_time: string | null;
  meet_location_zh: string;
  meet_location_en: string;
  activity_location_zh: string;
  activity_location_en: string;
  location_url: string;
  cover_image: string;
  capacity: number;
  registration_close_at: string | null;
  requires_approval: boolean;
  allow_waitlist: boolean;
  allow_cancellation: boolean;
  fee_amount: string;
  payment_model: Event["paymentModel"];
  deposit_amount: number | null;
  deposit_currency: Event["depositCurrency"];
  full_payment_amount: number | null;
  payment_instructions_zh: string;
  payment_instructions_en: string;
  seo_title_zh: string;
  seo_title_en: string;
  seo_description_zh: string;
  seo_description_en: string;
  waiver_text_en: string | null;
  waiver_text_sha: string | null;
};

export type EventRegistrationQuestionRow = {
  id: string;
  event_slug: string;
  question_key: string;
  type: EventQuestionType;
  required: boolean;
  sort_order: number;
  label_zh: string;
  label_en: string;
  help_zh: string;
  help_en: string;
  options_zh: unknown;
  options_en: unknown;
};

export type EventDetailModuleRow = {
  id: string;
  event_slug: string;
  module_type: EventDetailModuleType;
  display_mode: EventDetailDisplayMode;
  sort_order: number;
  title_zh: string;
  title_en: string;
  content_zh: string;
  content_en: string;
  items_zh: unknown;
  items_en: unknown;
};

export type EventRegistrationQuestionWriteRow = {
  event_slug: string;
  question_key: string;
  type: EventQuestionType;
  required: boolean;
  sort_order: number;
  label_zh: string;
  label_en: string;
  help_zh: string;
  help_en: string;
  options_zh: string[];
  options_en: string[];
};

export type EventDetailModuleWriteRow = {
  event_slug: string;
  module_type: EventDetailModuleType;
  display_mode: EventDetailDisplayMode;
  sort_order: number;
  title_zh: string;
  title_en: string;
  content_zh: string;
  content_en: string;
  items_zh: string[];
  items_en: string[];
};

export type EventBoothProgramRow = {
  event_slug: string;
  enabled: boolean;
  payment_instructions_en: string;
  payment_instructions_zh: string;
};

export type EventBoothPlanRow = {
  id: string;
  name_en: string;
  name_zh: string;
  description_en: string;
  description_zh: string;
  price_amount: number;
  price_currency: MerchantBoothCurrency;
};

export type EventPhysicalBoothRow = {
  id: string;
  booth_plan_id: string;
  booth_code: string;
};

export type EventBoothProgramRows = {
  program: EventBoothProgramRow;
  plans: EventBoothPlanRow[];
  booths: EventPhysicalBoothRow[];
};

export type EventAggregateWriteRows = {
  core: EventCoreRow;
  questions: EventRegistrationQuestionWriteRow[];
  modules: EventDetailModuleWriteRow[];
  merchantBoothProgram: EventBoothProgramRows | null;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function timeValue(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function nullableValue(value: string) {
  return value || null;
}

function boothProgramFromRows(rows: EventBoothProgramRows): EventMerchantBoothProgram {
  return {
    enabled: rows.program.enabled,
    paymentInstructions: {
      en: rows.program.payment_instructions_en,
      zh: rows.program.payment_instructions_zh,
    },
    plans: rows.plans.map(
      (plan): EventMerchantBoothPlan => ({
        id: plan.id,
        name: { en: plan.name_en, zh: plan.name_zh },
        description: { en: plan.description_en, zh: plan.description_zh },
        priceAmount: plan.price_amount,
        priceCurrency: plan.price_currency,
      }),
    ),
    booths: rows.booths.map(
      (booth): EventMerchantBoothPhysicalBooth => ({
        id: booth.id,
        boothPlanId: booth.booth_plan_id,
        boothCode: booth.booth_code,
      }),
    ),
  };
}

function emptyBoothProgram(): EventMerchantBoothProgram {
  return {
    enabled: false,
    paymentInstructions: { en: "", zh: "" },
    plans: [],
    booths: [],
  };
}

function normalizeBoothProgramForWrite(
  program: EventMerchantBoothProgram | null,
  eventSlug: string,
): EventBoothProgramRows | null {
  if (!program || !program.enabled) return null;
  return {
    program: {
      event_slug: eventSlug,
      enabled: true,
      payment_instructions_en: program.paymentInstructions.en,
      payment_instructions_zh: program.paymentInstructions.zh,
    },
    plans: program.plans.map((plan) => ({
      id: plan.id,
      name_en: plan.name.en,
      name_zh: plan.name.zh,
      description_en: plan.description.en,
      description_zh: plan.description.zh,
      price_amount: plan.priceAmount,
      price_currency: plan.priceCurrency,
    })),
    booths: program.booths.map((booth) => ({
      id: booth.id,
      booth_plan_id: booth.boothPlanId,
      booth_code: booth.boothCode,
    })),
  };
}

export function rowsToEvent(
  core: EventCoreRow,
  questions: EventRegistrationQuestionRow[],
  modules: EventDetailModuleRow[],
  boothProgram: EventBoothProgramRows | null,
): Event {
  return {
    slug: core.slug,
    status: core.status,
    registrationState: core.registration_state,
    title: { en: core.title_en, zh: core.title_zh },
    summary: { en: core.summary_en ?? "", zh: core.summary_zh ?? "" },
    eventDate: core.event_date ?? "",
    meetTime: timeValue(core.meet_time),
    meetLocation: { en: core.meet_location_en, zh: core.meet_location_zh },
    activityLocation: { en: core.activity_location_en, zh: core.activity_location_zh },
    locationUrl: core.location_url,
    coverImage: core.cover_image,
    capacity: core.capacity,
    registrationCount: 0,
    registrationCloseAt: core.registration_close_at ?? "",
    requiresApproval: core.requires_approval,
    allowWaitlist: core.allow_waitlist,
    allowCancellation: core.allow_cancellation,
    feeAmount: core.fee_amount,
    paymentModel: core.payment_model ?? "free",
    depositAmount: core.deposit_amount ?? null,
    depositCurrency: core.deposit_currency ?? "usd",
    fullPaymentAmount: core.full_payment_amount ?? null,
    paymentInstructions: {
      en: core.payment_instructions_en,
      zh: core.payment_instructions_zh,
    },
    seoTitle: { en: core.seo_title_en, zh: core.seo_title_zh },
    seoDescription: {
      en: core.seo_description_en,
      zh: core.seo_description_zh,
    },
    waiverTextEn: core.waiver_text_en,
    waiverTextSha: core.waiver_text_sha,
    registrationQuestions: ensureRequiredRegistrationQuestions(
      questions.toSorted((left, right) => left.sort_order - right.sort_order).map((question) => ({
        id: question.id,
        key: question.question_key,
        type: question.type,
        required: question.required,
        label: { en: question.label_en, zh: question.label_zh },
        helpText: { en: question.help_en, zh: question.help_zh },
        options: {
          en: stringArray(question.options_en),
          zh: stringArray(question.options_zh),
        },
      })),
    ),
    detailModules: modules
      .toSorted((left, right) => left.sort_order - right.sort_order)
      .map((moduleRow) => ({
        id: moduleRow.id,
        type: moduleRow.module_type,
        displayMode: moduleRow.display_mode,
        title: { en: moduleRow.title_en, zh: moduleRow.title_zh },
        content: { en: moduleRow.content_en, zh: moduleRow.content_zh },
        items: {
          en: stringArray(moduleRow.items_en),
          zh: stringArray(moduleRow.items_zh),
        },
      })),
    merchantBoothProgram: boothProgram && boothProgram.program.enabled ? boothProgramFromRows(boothProgram) : null,
  };
}

export function eventAggregateToWriteRows(event: Event): EventAggregateWriteRows {
  return {
    core: {
      slug: event.slug,
      status: event.status,
      registration_state: event.registrationState,
      title_zh: event.title.zh,
      title_en: event.title.en,
      summary_zh: event.summary?.zh ?? "",
      summary_en: event.summary?.en ?? "",
      event_date: nullableValue(event.eventDate),
      meet_time: nullableValue(event.meetTime),
      meet_location_zh: event.meetLocation.zh,
      meet_location_en: event.meetLocation.en,
      activity_location_zh: event.activityLocation.zh,
      activity_location_en: event.activityLocation.en,
      location_url: event.locationUrl,
      cover_image: event.coverImage,
      capacity: event.capacity,
      registration_close_at: nullableValue(event.registrationCloseAt),
      requires_approval: event.requiresApproval,
      allow_waitlist: event.allowWaitlist,
      allow_cancellation: event.allowCancellation,
      fee_amount: event.feeAmount,
      payment_model: event.paymentModel,
      deposit_amount: event.depositAmount,
      deposit_currency: event.depositCurrency,
      full_payment_amount: event.fullPaymentAmount,
      payment_instructions_zh: event.paymentInstructions.zh,
      payment_instructions_en: event.paymentInstructions.en,
      seo_title_zh: event.seoTitle.zh,
      seo_title_en: event.seoTitle.en,
      seo_description_zh: event.seoDescription.zh,
      seo_description_en: event.seoDescription.en,
      waiver_text_en: event.waiverTextEn ?? null,
      waiver_text_sha: event.waiverTextSha ?? null,
    },
    questions: ensureRequiredRegistrationQuestions(event.registrationQuestions).map((question, index) => ({
      event_slug: event.slug,
      question_key: question.key,
      type: question.type,
      required: question.required,
      sort_order: index,
      label_zh: question.label.zh,
      label_en: question.label.en,
      help_zh: question.helpText.zh,
      help_en: question.helpText.en,
      options_zh: question.options.zh,
      options_en: question.options.en,
    })),
    modules: event.detailModules.map((moduleRow, index) => ({
      event_slug: event.slug,
      module_type: moduleRow.type,
      display_mode: moduleRow.displayMode,
      sort_order: index,
      title_zh: moduleRow.title.zh,
      title_en: moduleRow.title.en,
      content_zh: moduleRow.content.zh,
      content_en: moduleRow.content.en,
      items_zh: moduleRow.items.zh,
      items_en: moduleRow.items.en,
    })),
    merchantBoothProgram: normalizeBoothProgramForWrite(event.merchantBoothProgram, event.slug),
  };
}
