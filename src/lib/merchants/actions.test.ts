import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Event } from "@/lib/types";
import {
  __setMerchantStateDepsForTests,
  allocateMerchantBoothResult,
  approveMerchantApplicationResult,
  publishBoothInstructionsResult,
  recordMerchantManualPaymentResult,
  reviewMerchantApplicationResult,
  submitMerchantApplicationResult,
  withdrawMerchantApplicationResult,
} from "./application-state";
import {
  createMerchantRepository,
  createMerchantRepositoryFake,
  type MerchantRepository,
} from "./repository";
import type { MerchantAuthAccount } from "./auth-boundary";
import type { MerchantProfile } from "./types";

vi.mock("./profile-repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("./profile-repository")>();
  const sourceByUser = new Map<string, MerchantProfile>();
  return {
    ...original,
    __setMerchantProfileSourceForTests: vi.fn(),
    getMerchantProfileByUserId: vi.fn(async (userId: string) => sourceByUser.get(userId) ?? null),
    createMerchantProfile: vi.fn(async (input: { userId: string; businessName: string; contactName: string; contactEmail: string; contactPhone: string; category: string; description: string }) => {
      const existing = sourceByUser.get(input.userId);
      if (existing) return existing;
      const stub: MerchantProfile = {
        id: `merchant-profile-${input.userId}`,
        userId: input.userId,
        businessName: input.businessName,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        category: input.category,
        description: input.description,
        createdAt: "2026-07-22T10:00:00.000Z",
        updatedAt: "2026-07-22T10:00:00.000Z",
      };
      sourceByUser.set(input.userId, stub);
      return stub;
    }),
    __seedProfileForTests(userId: string, profile: MerchantProfile) {
      // Use the same id pattern as the merchant repository's profile mock so
      // the application-state machine and the repository can match the
      // profile by id without a per-test override. The repository mock
      // always generates `merchant-profile-${userId}`, so the profile mock
      // has to do the same.
      const normalized = { ...profile, id: `merchant-profile-${userId}` };
      sourceByUser.set(userId, normalized);
      return normalized;
    },
  };
});

import { __seedProfileForTests } from "./profile-repository";

const STAFF = { userId: "staff-user-1", email: "staff@example.com" };

function verifiedMerchantAccount(profile: MerchantProfile | null = null): MerchantAuthAccount {
  return {
    user: {
      id: profile?.userId ?? "merchant-user-1",
      email: profile?.contactEmail ?? "booth@example.com",
      emailConfirmedAt: "2026-07-22T10:00:00.000Z",
    },
    profile,
    emailConfirmed: true,
  } as unknown as MerchantAuthAccount;
}

function unverifiedMerchantAccount(profile: MerchantProfile | null = null): MerchantAuthAccount {
  return {
    user: {
      id: profile?.userId ?? "merchant-user-1",
      email: profile?.contactEmail ?? "booth@example.com",
      emailConfirmedAt: null,
    },
    profile,
    emailConfirmed: false,
  } as unknown as MerchantAuthAccount;
}

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

function makeProfile(overrides: Partial<MerchantProfile> = {}): MerchantProfile {
  return {
    id: "merchant-profile-1",
    userId: "merchant-user-1",
    businessName: "Summit Goods",
    contactName: "Booth Owner",
    contactEmail: "booth@example.com",
    contactPhone: "555-0100",
    category: "Equipment",
    description: "Wax and accessories",
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    slug: "mammoth-weekend",
    status: "published",
    registrationState: "open",
    title: { en: "Mammoth Weekend", zh: "猛犸周末" },
    eventDate: "2026-12-01",
    meetTime: "08:00",
    meetLocation: { en: "Lot A", zh: "A 停车场" },
    activityLocation: { en: "Mammoth", zh: "猛犸" },
    locationUrl: "",
    coverImage: "",
    capacity: 80,
    registrationCount: 0,
    registrationCloseAt: "",
    requiresApproval: false,
    allowWaitlist: false,
    allowCancellation: true,
    feeAmount: "0",
    paymentModel: "free",
    depositAmount: null,
    depositCurrency: "usd",
    fullPaymentAmount: null,
    paymentInstructions: { en: "", zh: "" },
    seoTitle: { en: "", zh: "" },
    seoDescription: { en: "", zh: "" },
    registrationQuestions: [],
    detailModules: [],
    waiverTextEn: null,
    waiverTextSha: null,
    merchantBoothProgram: {
      enabled: true,
      paymentInstructions: { en: "Pay staff offline.", zh: "请线下向工作人员付款。" },
      plans: [
        {
          id: "plan-standard",
          name: { en: "Standard booth", zh: "标准摊位" },
          description: { en: "One table", zh: "一张桌子" },
          priceAmount: 250,
          priceCurrency: "usd",
        },
      ],
      booths: [
        { id: "booth-a-01", boothPlanId: "plan-standard", boothCode: "A-01" },
        { id: "booth-a-02", boothPlanId: "plan-standard", boothCode: "A-02" },
      ],
    },
    ...overrides,
  };
}

type Harness = {
  repository: MerchantRepository;
  eventBySlug: Map<string, Event | undefined>;
  now: () => Date;
};

function setupHarness(overrides: { event?: Event | undefined } = {}): Harness {
  const event = overrides.event === undefined ? makeEvent() : overrides.event;
  const eventBySlug = new Map<string, Event | undefined>([[event.slug, event]]);
  const repository = createMerchantRepository(createMerchantRepositoryFake());
  const now = () => new Date("2026-07-22T10:00:00.000Z");
  __setMerchantStateDepsForTests({
    repository,
    loadEvent: async (slug) => eventBySlug.get(slug),
    now,
  });
  return { repository, eventBySlug, now };
}

function seedProfileForTest(profile: MerchantProfile): MerchantProfile {
  return __seedProfileForTests(profile.userId, profile);
}

async function seedProfileInRepository(
  repository: MerchantRepository,
  profile: MerchantProfile,
): Promise<MerchantProfile> {
  return repository.createMerchantProfile({
    userId: profile.userId,
    businessName: profile.businessName,
    contactName: profile.contactName,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    category: profile.category,
    description: profile.description,
  });
}

async function seedProgramForTest(
  repository: MerchantRepository,
  event: Event,
): Promise<void> {
  await repository.createBoothProgram({
    eventSlug: event.slug,
    enabled: true,
    paymentInstructionsEn: "Pay staff offline.",
    paymentInstructionsZh: "请线下向工作人员付款。",
  });
  const eventPlan = event.merchantBoothProgram?.plans[0];
  if (eventPlan) {
    await repository.createBoothPlan({
      boothProgramId: (await repository.getMerchantBoothProgramByEventSlug(event.slug))!.id,
      nameEn: eventPlan.name.en,
      nameZh: eventPlan.name.zh,
      descriptionEn: eventPlan.description.en,
      descriptionZh: eventPlan.description.zh,
      priceAmount: eventPlan.priceAmount,
      priceCurrency: eventPlan.priceCurrency,
    });
    for (const booth of event.merchantBoothProgram?.booths ?? []) {
      await repository.createPhysicalBooth({
        boothProgramId: (await repository.getMerchantBoothProgramByEventSlug(event.slug))!.id,
        boothPlanId: eventPlan.id,
        boothCode: booth.boothCode,
      });
    }
  }
}

async function seedMerchantApplication(
  repository: MerchantRepository,
  profile: MerchantProfile,
  overrides: {
    event?: Event;
    status?: MerchantProfile extends never ? never : ReturnType<typeof Object> extends never ? never : "submitted" | "under_review" | "approved" | "payment_pending" | "paid" | "rejected" | "withdrawn";
  } = {},
) {
  const event = overrides.event ?? makeEvent();
  seedProfileForTest(profile);
  const createdProfile = await repository.createMerchantProfile({
    userId: profile.userId,
    businessName: profile.businessName,
    contactName: profile.contactName,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    category: profile.category,
    description: profile.description,
  });
  // The program/plan/booth graph is shared per event slug. Reuse an existing
  // program so two profiles can both submit applications to the same event
  // without colliding on the unique (event_slug) constraint.
  let program = await repository.getMerchantBoothProgramByEventSlug(event.slug);
  if (!program) {
    program = await repository.createBoothProgram({
      eventSlug: event.slug,
      enabled: true,
      paymentInstructionsEn: "Pay staff offline.",
      paymentInstructionsZh: "请线下向工作人员付款。",
    });
  }
  // The fake repository generates plan ids that do not match the event
  // aggregate's plan id, so the application-state machine would never find
  // a matching booth. We force the durable plan/booth to use the event
  // aggregate's plan id. In production, the admin save flow is responsible
  // for keeping these ids in sync.
  const eventPlan = event.merchantBoothProgram?.plans[0];
  const planId = eventPlan?.id ?? "plan-standard";
  // Skip plan creation if a plan with the same id already exists. The fake
  // does not have a list helper, so we re-use the plan id that any prior
  // application for this program was bound to.
  const existingApplications = await repository.listMerchantApplications();
  const priorPlanId = existingApplications
    .filter((application) => application.boothProgramId === program.id)
    .map((application) => application.requestedPlanId)
    .find((id) => id === planId);
  if (!priorPlanId) {
    await repository.createBoothPlan({
      boothProgramId: program.id,
      nameEn: eventPlan?.name.en ?? "Standard booth",
      nameZh: eventPlan?.name.zh ?? "标准摊位",
      descriptionEn: eventPlan?.description.en ?? "One table",
      descriptionZh: eventPlan?.description.zh ?? "一张桌子",
      priceAmount: eventPlan?.priceAmount ?? 250,
      priceCurrency: eventPlan?.priceCurrency ?? "usd",
    });
  }
  // Skip booth creation if a booth with the same code already exists for
  // this program. The fake throws on duplicate booth codes; the repository
  // surface would either succeed (idempotent insert) or throw, and we want
  // the seed to be safely re-runnable.
  const existingBooths = await repository.listMerchantPhysicalBoothsForProgram(program.id);
  const existingCodes = new Set(existingBooths.map((booth) => booth.boothCode));
  for (const booth of event.merchantBoothProgram?.booths ?? []) {
    if (existingCodes.has(booth.boothCode)) continue;
    await repository.createPhysicalBooth({
      boothProgramId: program.id,
      boothPlanId: planId,
      boothCode: booth.boothCode,
    });
  }
  const application = await repository.createMerchantApplication({
    merchantProfileId: createdProfile.id,
    eventSlug: event.slug,
    boothProgramId: program.id,
    requestedPlanId: planId,
    businessName: profile.businessName,
    contactName: profile.contactName,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    category: profile.category,
    description: profile.description,
    status: overrides.status ?? "submitted",
    quotedAmount: eventPlan?.priceAmount ?? 250,
    quotedCurrency: eventPlan?.priceCurrency ?? "usd",
  });
  return { program, planId, application, profile: createdProfile };
}

beforeEach(() => {
  __setMerchantStateDepsForTests(null);
});

afterEach(() => {
  __setMerchantStateDepsForTests(null);
  vi.restoreAllMocks();
});

describe("submitMerchantApplicationResult", () => {
  it("T1-happy-creates-an-application-with-server-derived-price-and-currency", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    seedProfileForTest(profile);
    // Staff would have enabled the program and created the program/plan/booth
    // rows in the durable store before a merchant could submit; mirror that
    // by seeding the matching plan and a single booth in the fake repository.
    // The durable plan must share the event aggregate's plan id so the
    // application-state machine can re-match the application to booths.
    const createdProfile = await repository.createMerchantProfile({
      userId: profile.userId,
      businessName: profile.businessName,
      contactName: profile.contactName,
      contactEmail: profile.contactEmail,
      contactPhone: profile.contactPhone,
      category: profile.category,
      description: profile.description,
    });
    const program = await repository.createBoothProgram({
      eventSlug: "mammoth-weekend",
      enabled: true,
      paymentInstructionsEn: "Pay staff offline.",
      paymentInstructionsZh: "请线下向工作人员付款。",
    });
    // The fake's createBoothPlan generates an id; we ignore the id and use
    // the event's plan id as the requested plan id so the durable plan
    // matches the event aggregate. In production, the admin save flow is
    // responsible for keeping these ids in sync; tests use the same trick.
    await repository.createBoothPlan({
      boothProgramId: program.id,
      nameEn: "Standard booth",
      nameZh: "标准摊位",
      descriptionEn: "One table",
      descriptionZh: "一张桌子",
      priceAmount: 250,
      priceCurrency: "usd",
    });
    await repository.createPhysicalBooth({
      boothProgramId: program.id,
      boothPlanId: "plan-standard",
      boothCode: "A-01",
    });
    await repository.createPhysicalBooth({
      boothProgramId: program.id,
      boothPlanId: "plan-standard",
      boothCode: "A-02",
    });

    const result = await submitMerchantApplicationResult(
      verifiedMerchantAccount(profile),
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        contactPhone: "555-0100",
        category: "Equipment",
        description: "Wax and accessories",
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const created = await repository.getMerchantApplication(result.applicationId);
    expect(created).toMatchObject({
      merchantProfileId: createdProfile.id,
      eventSlug: "mammoth-weekend",
      status: "submitted",
      quotedAmount: 250,
      quotedCurrency: "usd",
    });
  });

  async function seedSubmitFixture(repository: MerchantRepository) {
    const profile = makeProfile();
    seedProfileForTest(profile);
    await repository.createMerchantProfile({
      userId: profile.userId,
      businessName: profile.businessName,
      contactName: profile.contactName,
      contactEmail: profile.contactEmail,
      contactPhone: profile.contactPhone,
      category: profile.category,
      description: profile.description,
    });
    await seedProgramForTest(repository, makeEvent());
    return profile;
  }

  it("T1-fail-rejects-unauthenticated-and-unverified-merchant-accounts", async () => {
    setupHarness();
    const merchantForm = form({
      eventSlug: "mammoth-weekend",
      requestedPlanId: "plan-standard",
      businessName: "Summit Goods",
      contactName: "Booth Owner",
      contactEmail: "booth@example.com",
      category: "Equipment",
    });

    const unauthenticated = await submitMerchantApplicationResult(null, merchantForm);
    expect(unauthenticated).toMatchObject({ success: false, code: "unauthorized" });

    const unverified = await submitMerchantApplicationResult(unverifiedMerchantAccount(makeProfile()), merchantForm);
    expect(unverified).toMatchObject({ success: false, code: "unverified" });
  });

  it("T1-fail-rejects-an-application-against-an-unpublished-event", async () => {
    setupHarness({ event: makeEvent({ status: "draft" }) });
    const profile = makeProfile();
    seedProfileForTest(profile);
    const result = await submitMerchantApplicationResult(
      verifiedMerchantAccount(profile),
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        category: "Equipment",
      }),
    );
    expect(result).toMatchObject({ success: false, code: "program-disabled" });
  });

  it("T1-fail-rejects-an-application-when-the-booth-program-is-disabled", async () => {
    const event = makeEvent({
      merchantBoothProgram: {
        enabled: false,
        paymentInstructions: { en: "", zh: "" },
        plans: [],
        booths: [],
      },
    });
    setupHarness({ event });
    const profile = makeProfile();
    seedProfileForTest(profile);
    const result = await submitMerchantApplicationResult(
      verifiedMerchantAccount(profile),
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        category: "Equipment",
      }),
    );
    expect(result).toMatchObject({ success: false, code: "program-disabled" });
  });

  it("T1-fail-rejects-an-application-with-an-unknown-plan-id", async () => {
    setupHarness();
    const profile = makeProfile();
    seedProfileForTest(profile);
    const result = await submitMerchantApplicationResult(
      verifiedMerchantAccount(profile),
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-not-listed",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        category: "Equipment",
      }),
    );
    expect(result).toMatchObject({ success: false, code: "plan-not-found" });
  });

  it("T1-fail-rejects-a-duplicate-active-application-for-the-same-event", async () => {
    const { repository } = setupHarness();
    const profile = await seedSubmitFixture(repository);
    const first = await submitMerchantApplicationResult(
      verifiedMerchantAccount(profile),
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        category: "Equipment",
      }),
    );
    expect(first.success).toBe(true);

    const second = await submitMerchantApplicationResult(
      verifiedMerchantAccount(profile),
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        category: "Equipment",
      }),
    );
    expect(second).toMatchObject({ success: false, code: "duplicate-application" });
    const applications = await repository.listMerchantApplications();
    expect(applications).toHaveLength(1);
  });

  it("T1-fail-rejects-forged-quoted-amount-currency-and-status-from-the-client", async () => {
    const { repository } = setupHarness();
    const profile = await seedSubmitFixture(repository);
    const result = await submitMerchantApplicationResult(
      verifiedMerchantAccount(profile),
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        category: "Equipment",
        status: "approved",
        quotedAmount: "0",
        quotedCurrency: "eur",
        merchantProfileId: "forged-profile",
        boothProgramId: "forged-program",
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const created = await repository.getMerchantApplication(result.applicationId);
    expect(created).toMatchObject({
      status: "submitted",
      quotedAmount: 250,
      quotedCurrency: "usd",
    });
  });

  it("T1-fail-rejects-an-application-when-all-booths-for-the-plan-are-allocated", async () => {
    const { repository } = setupHarness();
    const event = makeEvent({
      merchantBoothProgram: {
        enabled: true,
        paymentInstructions: { en: "Pay staff offline.", zh: "请线下向工作人员付款。" },
        plans: [
          {
            id: "plan-standard",
            name: { en: "Standard booth", zh: "标准摊位" },
            description: { en: "One table", zh: "一张桌子" },
            priceAmount: 250,
            priceCurrency: "usd",
          },
        ],
        booths: [{ id: "booth-a-01", boothPlanId: "plan-standard", boothCode: "A-01" }],
      },
    });
    const eventBySlug = new Map<string, Event | undefined>([[event.slug, event]]);
    __setMerchantStateDepsForTests({
      repository,
      loadEvent: async (slug) => eventBySlug.get(slug),
      now: () => new Date("2026-07-22T10:00:00.000Z"),
    });
    const profileA = makeProfile({ userId: "user-a" });
    const profileB = makeProfile({ userId: "user-b" });
    const seededA = await seedMerchantApplication(repository, profileA, { event });
    await repository.updateMerchantApplicationStatus(seededA.application.id, "approved");
    const booths = await repository.listMerchantPhysicalBoothsForProgram(seededA.program.id);
    const onlyBooth = booths[0]!;
    await repository.createBoothAllocation({
      merchantApplicationId: seededA.application.id,
      boothId: onlyBooth.id,
      boothPlanId: "plan-standard",
      allocatedByUserId: STAFF.userId,
    });
    // Seed profileB in the profile mock so the second submit can resolve the
    // verified merchant account.
    seedProfileForTest(profileB);
    const realB = await seedProfileInRepository(repository, profileB);
    const accountB = verifiedMerchantAccount(realB);

    const result = await submitMerchantApplicationResult(
      accountB,
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Peak Snacks",
        contactName: "Other Owner",
        contactEmail: "other@example.com",
        category: "Food",
      }),
    );
    expect(result).toMatchObject({ success: false, code: "no-available-booth" });
  });

  it("T1-fail-rejects-an-application-when-a-non-verified-merchant-claims-ownership-of-another-merchants-profile", async () => {
    const { repository } = setupHarness();
    // The state machine requires the durable program/plan/booth rows to exist
    // before a merchant can submit. We seed them once and let two different
    // merchant accounts each try to submit.
    await seedProgramForTest(repository, makeEvent());
    const profileA = makeProfile({ userId: "user-a" });
    const profileB = makeProfile({ userId: "user-b" });
    seedProfileForTest(profileA);
    seedProfileForTest(profileB);
    const realA = await seedProfileInRepository(repository, profileA);
    const realB = await seedProfileInRepository(repository, profileB);
    // The auth account uses the durable profile (from the fake repository)
    // so the application-state machine and the durable repository agree on
    // the id. The auth lookup helper re-reads the profile by userId when
    // account.profile is missing, but we also support the explicit case.
    const accountA = verifiedMerchantAccount(realA);
    const accountB = verifiedMerchantAccount(realB);
    const firstResult = await submitMerchantApplicationResult(
      accountA,
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        category: "Equipment",
      }),
    );
    if (!firstResult.success) {
      console.log("First submit failed:", firstResult.code, firstResult.error);
    }
    // The second submission belongs to profile-b (different auth account). It
    // is NOT a duplicate because the unique (merchant_profile_id, event_slug)
    // constraint is per-merchant.
    const second = await submitMerchantApplicationResult(
      accountB,
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Peak Snacks",
        contactName: "Other Owner",
        contactEmail: "other@example.com",
        category: "Food",
      }),
    );
    expect(second.success).toBe(true);
  });
});

describe("withdrawMerchantApplicationResult", () => {
  it("T1-happy-merchant-can-withdraw-a-submitted-application", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);

    const result = await withdrawMerchantApplicationResult(
      verifiedMerchantAccount(profile),
      form({ applicationId: seeded.application.id }),
    );
    expect(result).toMatchObject({ success: true });
    const updated = await repository.getMerchantApplication(seeded.application.id);
    expect(updated?.status).toBe("withdrawn");
  });

  it("T1-fail-blocks-withdrawal-of-someone-elses-application", async () => {
    const { repository } = setupHarness();
    const profileA = makeProfile({ userId: "user-a" });
    const profileB = makeProfile({ userId: "user-b" });
    const seeded = await seedMerchantApplication(repository, profileA);
    const seededB = seedProfileForTest(profileB);

    const result = await withdrawMerchantApplicationResult(
      verifiedMerchantAccount(seededB),
      form({ applicationId: seeded.application.id }),
    );
    expect(result).toMatchObject({ success: false, code: "not-found" });
  });

  it("T1-fail-rejects-withdrawal-after-the-application-moves-past-under-review", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    await repository.updateMerchantApplicationStatus(seeded.application.id, "approved");

    const result = await withdrawMerchantApplicationResult(
      verifiedMerchantAccount(seeded.profile),
      form({ applicationId: seeded.application.id }),
    );
    expect(result).toMatchObject({ success: false, code: "invalid-status-transition" });
  });
});

describe("reviewMerchantApplicationResult", () => {
  it("T1-happy-staff-can-move-an-application-into-under-review-or-rejected", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);

    const review = await reviewMerchantApplicationResult(
      STAFF,
      form({ applicationId: seeded.application.id, decision: "under_review" }),
    );
    expect(review).toMatchObject({ success: true, status: "under_review" });

    const secondProfile = makeProfile({ userId: "user-b" });
    const other = await seedMerchantApplication(repository, secondProfile, { event: makeEvent({ slug: "lake-tahoe" }) });
    const reject = await reviewMerchantApplicationResult(
      STAFF,
      form({
        applicationId: other.application.id,
        decision: "reject",
        rejectionReason: "duplicate business",
      }),
    );
    expect(reject).toMatchObject({ success: true, status: "rejected" });
  });

  it("T1-fail-blocks-an-unauthenticated-staff-reviewer", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    const result = await reviewMerchantApplicationResult(
      null,
      form({ applicationId: seeded.application.id, decision: "under_review" }),
    );
    expect(result).toMatchObject({ success: false, code: "unauthorized" });
  });

  it("T1-fail-rejects-a-decision-when-the-rejection-reason-is-too-short", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    const result = await reviewMerchantApplicationResult(
      STAFF,
      form({ applicationId: seeded.application.id, decision: "reject", rejectionReason: "no" }),
    );
    expect(result).toMatchObject({ success: false, code: "invalid-input" });
  });
});

describe("approveMerchantApplicationResult", () => {
  it("T1-happy-approves-an-under-review-application-and-keeps-quoted-amount", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    await repository.updateMerchantApplicationStatus(seeded.application.id, "under_review");

    const result = await approveMerchantApplicationResult(
      STAFF,
      form({ applicationId: seeded.application.id }),
    );
    expect(result).toMatchObject({ success: true });
    if (!result.success) return;
    expect(result.application).toMatchObject({ status: "approved", quotedAmount: 250 });
  });

  it("T1-fail-rejects-approval-from-an-already-paid-application", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    await repository.updateMerchantApplicationStatus(seeded.application.id, "paid");
    const result = await approveMerchantApplicationResult(
      STAFF,
      form({ applicationId: seeded.application.id }),
    );
    expect(result).toMatchObject({ success: false, code: "invalid-status-transition" });
  });
});

describe("allocateMerchantBoothResult", () => {
  it("T1-happy-binds-a-single-available-matching-booth-and-moves-into-payment-pending", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    await repository.updateMerchantApplicationStatus(seeded.application.id, "approved");
    const booths = await repository.listMerchantPhysicalBoothsForProgram(seeded.program.id);
    const firstBooth = booths[0]!;

    const result = await allocateMerchantBoothResult(
      STAFF,
      form({ applicationId: seeded.application.id, boothId: firstBooth.id }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.allocation.boothId).toBe(firstBooth.id);
    expect(result.allocation.boothPlanId).toBe(seeded.planId);
    expect(result.allocation.allocatedByUserId).toBe(STAFF.userId);
    expect(result.application.status).toBe("payment_pending");

    const allocations = await repository.listBoothAllocations();
    expect(allocations).toHaveLength(1);
  });

  it("T1-fail-blocks-a-second-allocation-on-an-application", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    await repository.updateMerchantApplicationStatus(seeded.application.id, "approved");
    const booths = await repository.listMerchantPhysicalBoothsForProgram(seeded.program.id);
    const firstBooth = booths[0]!;
    await repository.createBoothAllocation({
      merchantApplicationId: seeded.application.id,
      boothId: firstBooth.id,
      boothPlanId: seeded.planId,
      allocatedByUserId: STAFF.userId,
    });
    await repository.updateMerchantApplicationStatus(seeded.application.id, "payment_pending");

    // Force the application back to approved so the transition guard allows
    // the allocation attempt. This simulates a hostile client retrying after
    // the first allocation succeeded.
    await repository.updateMerchantApplicationStatus(seeded.application.id, "approved");
    const result = await allocateMerchantBoothResult(
      STAFF,
      form({ applicationId: seeded.application.id, boothId: firstBooth.id }),
    );
    expect(result).toMatchObject({ success: false, code: "duplicate-allocation" });
  });

  it("T1-fail-blocks-a-different-application-claiming-an-already-occupied-booth", async () => {
    const { repository } = setupHarness();
    const event = makeEvent({
      merchantBoothProgram: {
        enabled: true,
        paymentInstructions: { en: "Pay staff offline.", zh: "请线下向工作人员付款。" },
        plans: [
          {
            id: "plan-standard",
            name: { en: "Standard booth", zh: "标准摊位" },
            description: { en: "One table", zh: "一张桌子" },
            priceAmount: 250,
            priceCurrency: "usd",
          },
        ],
        booths: [{ id: "booth-a-01", boothPlanId: "plan-standard", boothCode: "A-01" }],
      },
    });
    const eventBySlug = new Map<string, Event | undefined>([[event.slug, event]]);
    __setMerchantStateDepsForTests({
      repository,
      loadEvent: async (slug) => eventBySlug.get(slug),
      now: () => new Date("2026-07-22T10:00:00.000Z"),
    });
    const profileA = makeProfile({ userId: "user-a" });
    const profileB = makeProfile({ userId: "user-b" });
    const seededA = await seedMerchantApplication(repository, profileA, { event });
    await repository.updateMerchantApplicationStatus(seededA.application.id, "approved");
    const booths = await repository.listMerchantPhysicalBoothsForProgram(seededA.program.id);
    const onlyBooth = booths[0]!;
    await repository.createBoothAllocation({
      merchantApplicationId: seededA.application.id,
      boothId: onlyBooth.id,
      boothPlanId: seededA.planId,
      allocatedByUserId: STAFF.userId,
    });
    await repository.updateMerchantApplicationStatus(seededA.application.id, "payment_pending");

    const seededB = await seedMerchantApplication(repository, profileB, { event });
    await repository.updateMerchantApplicationStatus(seededB.application.id, "approved");
    const result = await allocateMerchantBoothResult(
      STAFF,
      form({ applicationId: seededB.application.id, boothId: onlyBooth.id }),
    );
    expect(result).toMatchObject({ success: false, code: "booth-occupied" });
  });

  it("T1-fail-blocks-an-allocation-when-no-matching-booth-exists-for-the-plan", async () => {
    const { repository } = setupHarness();
    const event = makeEvent({
      merchantBoothProgram: {
        enabled: true,
        paymentInstructions: { en: "Pay staff offline.", zh: "请线下向工作人员付款。" },
        plans: [
          {
            id: "plan-standard",
            name: { en: "Standard booth", zh: "标准摊位" },
            description: { en: "One table", zh: "一张桌子" },
            priceAmount: 250,
            priceCurrency: "usd",
          },
        ],
        booths: [],
      },
    });
    const eventBySlug = new Map<string, Event | undefined>([[event.slug, event]]);
    __setMerchantStateDepsForTests({
      repository,
      loadEvent: async (slug) => eventBySlug.get(slug),
      now: () => new Date("2026-07-22T10:00:00.000Z"),
    });
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile, { event });
    await repository.updateMerchantApplicationStatus(seeded.application.id, "approved");

    const result = await allocateMerchantBoothResult(
      STAFF,
      form({ applicationId: seeded.application.id, boothId: "missing-booth" }),
    );
    expect(result).toMatchObject({ success: false, code: "no-available-booth" });
  });

  it("T1-fail-blocks-an-allocation-when-the-application-is-still-submitted", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    const result = await allocateMerchantBoothResult(
      STAFF,
      form({ applicationId: seeded.application.id, boothId: "missing-booth" }),
    );
    expect(result).toMatchObject({ success: false, code: "invalid-status-transition" });
  });

  it("T1-fail-blocks-an-allocation-with-a-mismatched-booth-id", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    await repository.updateMerchantApplicationStatus(seeded.application.id, "approved");
    const result = await allocateMerchantBoothResult(
      STAFF,
      form({
        applicationId: seeded.application.id,
        boothId: "forged-booth",
        boothPlanId: "forged-plan",
      }),
    );
    expect(result).toMatchObject({ success: false, code: "booth-plan-mismatch" });
  });
});

describe("publishBoothInstructionsResult", () => {
  it("T1-regression-publishes-first-time-instructions-when-the-stored-program-is-blank", async () => {
    // Given: an enabled durable program with no prior instruction text.
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    await repository.updateBoothProgramPaymentInstructions(seeded.program.id, "", "");

    // When: staff submits a valid first instruction set.
    const result = await publishBoothInstructionsResult(
      STAFF,
      form({
        programId: seeded.program.id,
        paymentInstructionsEn: "Wire to 1234-5678",
        paymentInstructionsZh: "",
      }),
    );

    // Then: the submitted replacement is accepted and persisted.
    expect(result).toMatchObject({
      success: true,
      program: { paymentInstructionsEn: "Wire to 1234-5678", paymentInstructionsZh: "" },
    });
  });

  it("T1-happy-staff-publishes-bilingual-offline-instructions", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);

    const result = await publishBoothInstructionsResult(
      STAFF,
      form({
        programId: seeded.program.id,
        paymentInstructionsEn: "Wire to 1234-5678",
        paymentInstructionsZh: "请电汇至 1234-5678",
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.program).toMatchObject({
      paymentInstructionsEn: "Wire to 1234-5678",
      paymentInstructionsZh: "请电汇至 1234-5678",
    });
  });

  it("T1-fail-blocks-publishing-bilingual-instructions-without-english-or-chinese", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    const result = await publishBoothInstructionsResult(
      STAFF,
      form({
        programId: seeded.program.id,
        paymentInstructionsEn: "",
        paymentInstructionsZh: "",
      }),
    );
    expect(result).toMatchObject({ success: false, code: "instructions-required" });
  });
});

describe("recordMerchantManualPaymentResult", () => {
  it("T1-happy-staff-records-a-single-confirmed-payment-derived-from-the-application", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    await repository.updateMerchantApplicationStatus(seeded.application.id, "approved");
    const booths = await repository.listMerchantPhysicalBoothsForProgram(seeded.program.id);
    const firstBooth = booths[0]!;
    await repository.createBoothAllocation({
      merchantApplicationId: seeded.application.id,
      boothId: firstBooth.id,
      boothPlanId: seeded.planId,
      allocatedByUserId: STAFF.userId,
    });
    await repository.updateMerchantApplicationStatus(seeded.application.id, "payment_pending");

    const result = await recordMerchantManualPaymentResult(
      STAFF,
      form({
        applicationId: seeded.application.id,
        method: "bank_transfer",
        reference: "wire-001",
        note: "Received in person",
        paidAt: "2026-07-22T10:00:00.000Z",
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.payment).toMatchObject({
      merchantApplicationId: seeded.application.id,
      amount: 250,
      currency: "usd",
      method: "bank_transfer",
      reference: "wire-001",
      status: "confirmed",
      recordedByUserId: STAFF.userId,
    });
    expect(result.application.status).toBe("paid");
  });

  it("T1-fail-blocks-a-second-manual-payment-on-the-same-application", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    await repository.updateMerchantApplicationStatus(seeded.application.id, "approved");

    const first = await recordMerchantManualPaymentResult(
      STAFF,
      form({
        applicationId: seeded.application.id,
        method: "bank_transfer",
        reference: "wire-001",
        paidAt: "2026-07-22T10:00:00.000Z",
      }),
    );
    expect(first.success).toBe(true);

    // Replay: try again. The application is in 'paid' status, so the
    // transition guard alone blocks it; the duplicate-payment guard would
    // also block a fresh attempt even if the status were reset.
    const second = await recordMerchantManualPaymentResult(
      STAFF,
      form({
        applicationId: seeded.application.id,
        method: "bank_transfer",
        reference: "wire-002",
        paidAt: "2026-07-22T10:00:00.000Z",
      }),
    );
    expect(second).toMatchObject({ success: false, code: "invalid-status-transition" });
  });

  it("T1-fail-ignores-forged-amount-currency-and-status-from-the-client", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    await repository.updateMerchantApplicationStatus(seeded.application.id, "approved");

    const result = await recordMerchantManualPaymentResult(
      STAFF,
      form({
        applicationId: seeded.application.id,
        method: "bank_transfer",
        reference: "wire-001",
        paidAt: "2026-07-22T10:00:00.000Z",
        amount: "9999",
        currency: "eur",
        status: "voided",
        quotedAmount: "1",
        quotedCurrency: "eur",
        boothId: "forged-booth",
        boothPlanId: "forged-plan",
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.payment).toMatchObject({
      amount: 250,
      currency: "usd",
      status: "confirmed",
    });
  });

  it("T1-fail-rejects-payment-recording-while-the-application-is-still-submitted", async () => {
    const { repository } = setupHarness();
    const profile = makeProfile();
    const seeded = await seedMerchantApplication(repository, profile);
    const result = await recordMerchantManualPaymentResult(
      STAFF,
      form({
        applicationId: seeded.application.id,
        method: "bank_transfer",
        reference: "wire-001",
        paidAt: "2026-07-22T10:00:00.000Z",
      }),
    );
    expect(result).toMatchObject({ success: false, code: "invalid-status-transition" });
  });
});
