import { describe, expect, it } from "vitest";
import type { MerchantApplicationRow } from "./types";
import {
  createMerchantRepository,
  createMerchantRepositoryFake,
  mapMerchantApplicationRow,
} from "./repository";

describe("merchant repository", () => {
  it("maps a complete merchant booth graph from a source fake", async () => {
    // Given: one merchant and one event-specific physical booth.
    const repository = createMerchantRepository(createMerchantRepositoryFake());
    const merchant = await repository.createMerchantProfile({
      userId: "merchant-user-1",
      businessName: "Summit Goods",
      contactName: "Rider One",
      contactEmail: "rider@example.com",
      contactPhone: "555-0100",
      category: "Equipment",
      description: "Wax and accessories",
    });
    const program = await repository.createBoothProgram({
      eventSlug: "mammoth-weekend",
      enabled: true,
      paymentInstructionsEn: "Pay staff offline.",
      paymentInstructionsZh: "请线下向工作人员付款。",
    });
    const plan = await repository.createBoothPlan({
      boothProgramId: program.id,
      nameEn: "Standard booth",
      nameZh: "标准摊位",
      descriptionEn: "One table",
      descriptionZh: "一张桌子",
      priceAmount: 250,
      priceCurrency: "usd",
    });
    const booth = await repository.createPhysicalBooth({
      boothProgramId: program.id,
      boothPlanId: plan.id,
      boothCode: "A-01",
    });
    const application = await repository.createMerchantApplication({
      merchantProfileId: merchant.id,
      eventSlug: program.eventSlug,
      boothProgramId: program.id,
      requestedPlanId: plan.id,
      businessName: merchant.businessName,
      contactName: merchant.contactName,
      contactEmail: merchant.contactEmail,
      contactPhone: merchant.contactPhone,
      category: merchant.category,
      description: merchant.description,
      status: "submitted",
      quotedAmount: plan.priceAmount,
      quotedCurrency: plan.priceCurrency,
    });

    // When: staff allocates the compatible booth and records an offline payment once.
    const allocation = await repository.createBoothAllocation({
      merchantApplicationId: application.id,
      boothId: booth.id,
      boothPlanId: plan.id,
      allocatedByUserId: "staff-user-1",
    });
    const payment = await repository.createManualPayment({
      merchantApplicationId: application.id,
      amount: application.quotedAmount,
      currency: application.quotedCurrency,
      method: "bank_transfer",
      reference: "wire-001",
      note: "Received by staff",
      paidAt: "2026-07-22T10:00:00.000Z",
      recordedByUserId: "staff-user-1",
      status: "confirmed",
    });

    // Then: the camel-case domain graph retains source values and relationships.
    expect(merchant).toMatchObject({ userId: "merchant-user-1", businessName: "Summit Goods" });
    expect(allocation).toMatchObject({ merchantApplicationId: application.id, boothId: booth.id });
    expect(payment).toMatchObject({ merchantApplicationId: application.id, amount: 250, currency: "usd" });
  });

  it("rejects repeated application, booth allocation, and manual payment writes", async () => {
    // Given: two merchants request the same plan and a first application already owns its booth.
    const repository = createMerchantRepository(createMerchantRepositoryFake());
    const program = await repository.createBoothProgram({
      eventSlug: "mammoth-weekend",
      enabled: true,
      paymentInstructionsEn: "Pay staff offline.",
      paymentInstructionsZh: "请线下向工作人员付款。",
    });
    const plan = await repository.createBoothPlan({
      boothProgramId: program.id,
      nameEn: "Standard booth",
      nameZh: "标准摊位",
      descriptionEn: "One table",
      descriptionZh: "一张桌子",
      priceAmount: 250,
      priceCurrency: "usd",
    });
    const booth = await repository.createPhysicalBooth({
      boothProgramId: program.id,
      boothPlanId: plan.id,
      boothCode: "A-01",
    });
    const firstMerchant = await repository.createMerchantProfile({
      userId: "merchant-user-1",
      businessName: "Summit Goods",
      contactName: "Rider One",
      contactEmail: "rider@example.com",
      contactPhone: "555-0100",
      category: "Equipment",
      description: "Wax and accessories",
    });
    const secondMerchant = await repository.createMerchantProfile({
      userId: "merchant-user-2",
      businessName: "Peak Snacks",
      contactName: "Rider Two",
      contactEmail: "rider.two@example.com",
      contactPhone: "555-0101",
      category: "Food",
      description: "Mountain snacks",
    });
    const applicationInput = {
      eventSlug: program.eventSlug,
      boothProgramId: program.id,
      requestedPlanId: plan.id,
      businessName: "Summit Goods",
      contactName: "Rider One",
      contactEmail: "rider@example.com",
      contactPhone: "555-0100",
      category: "Equipment",
      description: "Wax and accessories",
      status: "submitted" as const,
      quotedAmount: 250,
      quotedCurrency: "usd" as const,
    };
    const firstApplication = await repository.createMerchantApplication({
      ...applicationInput,
      merchantProfileId: firstMerchant.id,
    });
    const secondApplication = await repository.createMerchantApplication({
      ...applicationInput,
      merchantProfileId: secondMerchant.id,
    });
    await repository.createBoothAllocation({
      merchantApplicationId: firstApplication.id,
      boothId: booth.id,
      boothPlanId: plan.id,
      allocatedByUserId: "staff-user-1",
    });
    await repository.createManualPayment({
      merchantApplicationId: firstApplication.id,
      amount: 250,
      currency: "usd",
      method: "bank_transfer",
      reference: "wire-001",
      note: "Received by staff",
      paidAt: "2026-07-22T10:00:00.000Z",
      recordedByUserId: "staff-user-1",
      status: "confirmed",
    });

    // When / Then: each constraint-safe repeated write is rejected without another row.
    await expect(repository.createMerchantApplication({
      ...applicationInput,
      merchantProfileId: firstMerchant.id,
    })).rejects.toMatchObject({ code: "duplicate-application" });
    await expect(repository.createBoothAllocation({
      merchantApplicationId: secondApplication.id,
      boothId: booth.id,
      boothPlanId: plan.id,
      allocatedByUserId: "staff-user-1",
    })).rejects.toMatchObject({ code: "occupied-booth" });
    await expect(repository.createManualPayment({
      merchantApplicationId: firstApplication.id,
      amount: 250,
      currency: "usd",
      method: "bank_transfer",
      reference: "wire-002",
      note: "Repeated confirmation",
      paidAt: "2026-07-22T10:05:00.000Z",
      recordedByUserId: "staff-user-1",
      status: "confirmed",
    })).rejects.toMatchObject({ code: "duplicate-manual-payment" });
    expect(await repository.getMerchantApplicationForMerchant(
      secondMerchant.id,
      firstApplication.id,
    )).toBeUndefined();
  });

  it("rejects malformed money and status before they enter the merchant domain", async () => {
    // Given: raw persistence rows with invalid status or money facts.
    const repository = createMerchantRepository(createMerchantRepositoryFake());
    const program = await repository.createBoothProgram({
      eventSlug: "mammoth-weekend",
      enabled: true,
      paymentInstructionsEn: "Pay staff offline.",
      paymentInstructionsZh: "请线下向工作人员付款。",
    });
    const malformedApplication: MerchantApplicationRow = {
      id: "application-1",
      merchant_profile_id: "merchant-profile-1",
      event_slug: "mammoth-weekend",
      booth_program_id: "program-1",
      requested_plan_id: "plan-1",
      business_name: "Summit Goods",
      contact_name: "Rider One",
      contact_email: "rider@example.com",
      contact_phone: "555-0100",
      category: "Equipment",
      description: "Wax and accessories",
      status: "impossible-status",
      quoted_amount: 250,
      quoted_currency: "usd",
      created_at: "2026-07-22T10:00:00.000Z",
      updated_at: "2026-07-22T10:00:00.000Z",
    };

    // When / Then: persistence mapping refuses invalid facts before they enter the domain.
    expect(() => mapMerchantApplicationRow(malformedApplication)).toThrow("invalid-status");
    await expect(repository.createBoothPlan({
      boothProgramId: program.id,
      nameEn: "Standard booth",
      nameZh: "标准摊位",
      descriptionEn: "One table",
      descriptionZh: "一张桌子",
      priceAmount: 0,
      priceCurrency: "usd",
    })).rejects.toMatchObject({ code: "invalid-money" });
  });
});
