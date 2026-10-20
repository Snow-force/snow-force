import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe: mocks.load }));
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); });
it("shares one official SDK promise across warmup, render and language changes without retaining payment state", async () => {
  const { loadCheckoutStripe } = await import("./stripe-loader");
  const client = {}; mocks.load.mockResolvedValue(client);
  const first = loadCheckoutStripe("pk_test_fixture");
  expect(loadCheckoutStripe("pk_test_fixture")).toBe(first);
  expect(await first).toBe(client);
  expect(loadCheckoutStripe("pk_test_fixture")).toBe(first);
  expect(mocks.load).toHaveBeenCalledExactlyOnceWith("pk_test_fixture");
});
it("evicts rejection, null and synchronous SDK failures so explicit retry can recover", async () => {
  const { loadCheckoutStripe } = await import("./stripe-loader");
  mocks.load.mockRejectedValueOnce(Error("network")); expect(await loadCheckoutStripe("pk_test_fixture")).toBeNull();
  mocks.load.mockResolvedValueOnce(null); expect(await loadCheckoutStripe("pk_test_fixture")).toBeNull();
  mocks.load.mockImplementationOnce(() => { throw Error("SDK" ); }); expect(await loadCheckoutStripe("pk_test_fixture")).toBeNull();
  mocks.load.mockResolvedValueOnce({}); expect(await loadCheckoutStripe("pk_test_fixture")).toEqual({}); expect(mocks.load).toHaveBeenCalledTimes(4);
});
it("rejects non-public keys and bounds cache entries while keeping keys isolated", async () => {
  const { loadCheckoutStripe } = await import("./stripe-loader"); mocks.load.mockResolvedValue({});
  expect(await loadCheckoutStripe("sk_test_fixture")).toBeNull(); expect(mocks.load).not.toHaveBeenCalled();
  const first = loadCheckoutStripe("pk_test_first"); await first;
  for (const key of ["second", "third", "fourth", "fifth"]) await loadCheckoutStripe(`pk_test_${key}`);
  expect(loadCheckoutStripe("pk_test_first")).not.toBe(first);
});
it("selects a bounded controlled cohort and makes disabled mode deterministic", async () => {
  const { selectStripeWarmup } = await import("./stripe-loader"); const random = vi.spyOn(Math, "random").mockReturnValue(.2);
  for (const rate of [0, -1, 1.1, NaN, Infinity]) expect(selectStripeWarmup(rate)).toBe(false);
  expect(random).not.toHaveBeenCalled(); expect(selectStripeWarmup(1)).toBe(true); expect(selectStripeWarmup(.1)).toBe(false); expect(selectStripeWarmup(.5)).toBe(true); random.mockRestore();
});
