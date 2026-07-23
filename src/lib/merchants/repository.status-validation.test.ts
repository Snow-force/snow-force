import { describe, expect, it } from "vitest";
import type { MerchantRepositorySource } from "./repository";
import { createMerchantRepository, createMerchantRepositoryFake } from "./repository";

function createRepositoryWithWriteLog() {
  const fake = createMerchantRepositoryFake();
  const applicationStatuses: string[] = [];
  const paymentStatuses: string[] = [];
  const source: MerchantRepositorySource = {
    ...fake,
    async createApplication(input) {
      applicationStatuses.push(input.status);
      return fake.createApplication(input);
    },
    async createManualPayment(input) {
      paymentStatuses.push(input.status);
      return fake.createManualPayment(input);
    },
  };

  return {
    repository: createMerchantRepository(source),
    applicationStatuses,
    paymentStatuses,
  };
}

async function createApplicationInput(
  repository: ReturnType<typeof createMerchantRepository>,
) {
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

  return {
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
    status: "submitted" as const,
    quotedAmount: plan.priceAmount,
    quotedCurrency: plan.priceCurrency,
  };
}

describe("merchant source-write status validation", () => {
  it("rejects an invalid application status before persistence and allows a valid retry", async () => {
    // Given: a valid application payload and a source that records every attempted write.
    const { repository, applicationStatuses } = createRepositoryWithWriteLog();
    const applicationInput = await createApplicationInput(repository);
    const invalidApplicationInput = { ...applicationInput, status: "invalid-application-status" };

    // When: an untyped runtime caller supplies a malformed status, then retries validly.
    await expect(Reflect.apply(
      repository.createMerchantApplication,
      repository,
      [invalidApplicationInput],
    )).rejects.toMatchObject({ code: "invalid-status" });
    const validApplication = await repository.createMerchantApplication(applicationInput);

    // Then: the invalid value never reaches the source and the valid retry is accepted once.
    expect(applicationStatuses).toEqual(["submitted"]);
    expect(validApplication.status).toBe("submitted");
  });

  it("rejects an invalid manual-payment status before persistence and allows a valid retry", async () => {
    // Given: a persisted application and a source that records manual-payment writes.
    const { repository, paymentStatuses } = createRepositoryWithWriteLog();
    const application = await repository.createMerchantApplication(await createApplicationInput(repository));
    const validPaymentInput = {
      merchantApplicationId: application.id,
      amount: application.quotedAmount,
      currency: application.quotedCurrency,
      method: "bank_transfer",
      reference: "wire-001",
      note: "Received by staff",
      paidAt: "2026-07-22T10:00:00.000Z",
      recordedByUserId: "staff-user-1",
      status: "confirmed" as const,
    };
    const invalidPaymentInput = { ...validPaymentInput, status: "invalid-payment-status" };

    // When: an untyped runtime caller supplies a malformed status, then retries validly.
    await expect(Reflect.apply(
      repository.createManualPayment,
      repository,
      [invalidPaymentInput],
    )).rejects.toMatchObject({ code: "invalid-status" });
    const validPayment = await repository.createManualPayment(validPaymentInput);

    // Then: the invalid value never reaches the source and the valid retry creates one payment.
    expect(paymentStatuses).toEqual(["confirmed"]);
    expect(validPayment.status).toBe("confirmed");
  });
});
