import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createRegistrationRefundStore } from "./refund-repository";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("registration refund store", () => {
  it("persists and updates the refund audit record", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "snowforce-refunds-"));
    tempDirs.push(dir);
    const store = createRegistrationRefundStore(path.join(dir, "refunds.json"));
    const created = await store.create({
      id: "11111111-1111-4111-8111-111111111111",
      registrationId: "reg-1",
      stripePaymentIntentId: "pi_test_1",
      amount: 40,
      currency: "usd",
      status: "creating",
      reason: "requested_by_customer",
      internalNote: "Customer request",
      initiatedBy: "admin-1",
    });

    await store.update(created.id, { stripeRefundId: "re_test_1", status: "succeeded" });

    expect(await store.getByStripeRefundId("re_test_1")).toEqual(expect.objectContaining({
      registrationId: "reg-1",
      amount: 40,
      status: "succeeded",
    }));
  });
});
