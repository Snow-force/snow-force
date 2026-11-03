import { expect, it } from "vitest";
import type { RegistrationRefund } from "@/lib/types";
import {
  cancellationRefundStatus,
  refundLabel,
  type CancellationRequest,
} from "./cancellation-types";
const request: CancellationRequest = {
  id: "request",
  registration_id: "ticket",
  requested_by: "booker",
  reason: "Cannot attend",
  status: "approved",
  decision_note: "Approved",
  reviewed_by: "admin",
  reviewed_at: "2026-11-03",
  refund_amount: 99,
  refund_operation_id: "operation",
  created_at: "2026-11-03",
  updated_at: "2026-11-03",
};
const refund: RegistrationRefund = {
  id: "operation",
  registrationId: "ticket",
  stripeRefundId: "re_1",
  stripePaymentIntentId: "pi_1",
  amount: 99,
  currency: "usd",
  status: "pending",
  reason: "requested_by_customer",
  internalNote: "Approved",
  initiatedBy: "admin",
  failureReason: "",
  createdAt: "2026-11-03",
  updatedAt: "2026-11-03",
};
it("distinguishes approval, execution, failure and actual returned money without settlement flags", () => {
  expect(cancellationRefundStatus(request, [], 0, 99)).toBe(
    "awaiting_execution",
  );
  expect(cancellationRefundStatus(request, [refund], 0, 99)).toBe("pending");
  expect(
    cancellationRefundStatus(request, [{ ...refund, status: "failed" }], 0, 99),
  ).toBe("failed");
  expect(
    cancellationRefundStatus(
      request,
      [{ ...refund, status: "succeeded" }],
      0,
      99,
    ),
  ).toBe("reconciliation_required");
  expect(
    cancellationRefundStatus(
      request,
      [{ ...refund, status: "succeeded" }],
      99,
      99,
    ),
  ).toBe("fully_refunded");
  expect(cancellationRefundStatus(null, [], 20, 99)).toBe("partially_refunded");
  expect(
    cancellationRefundStatus(
      { ...request, refund_amount: 0, refund_operation_id: null },
      [],
      0,
      99,
    ),
  ).toBe("no_refund");
  expect(refundLabel("pending").en).toBe("Refund processing");
});
