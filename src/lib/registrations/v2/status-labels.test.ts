import { expect, it } from "vitest";
import { bookingStatusLabel } from "./status-labels";
it("explains payment, signature, guardian review and delivery as separate bilingual states", () => {
  expect(bookingStatusLabel("paid_requires_review").zh).toContain("付款");
  expect(bookingStatusLabel("needs_review").zh).toContain("监护");
  expect(bookingStatusLabel("sent").en).not.toBe(bookingStatusLabel("delivered").en);
  expect(bookingStatusLabel("unrecognized_internal_value").en).toBe("Contact staff for status");
});
