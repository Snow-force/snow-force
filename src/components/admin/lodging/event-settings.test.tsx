import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/lodging/repository", () => ({ loadCatalog: vi.fn(), lodgingAdminEnabled: vi.fn() }));
import { requireAdmin } from "@/lib/auth/admin";
import { loadCatalog, lodgingAdminEnabled } from "@/lib/lodging/repository";
import { EventLodgingSettings } from "./event-settings";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ userId: "staff", email: "staff@example.test", role: "manager" });
  vi.mocked(lodgingAdminEnabled).mockReturnValue(true);
  vi.mocked(loadCatalog).mockResolvedValue({ properties: [], rooms: [], offers: [] });
});
it("authorizes staff before reading privileged activity packages", async () => {
  vi.mocked(requireAdmin).mockRejectedValue(new Error("denied"));
  await expect(EventLodgingSettings({ eventSlug: "trip" })).rejects.toThrow("denied");
  expect(loadCatalog).not.toHaveBeenCalled();
});
it("avoids database reads while disabled", async () => {
  vi.mocked(lodgingAdminEnabled).mockReturnValue(false);
  expect((await EventLodgingSettings({ eventSlug: "trip" })).props.status).toBe("disabled");
  expect(loadCatalog).not.toHaveBeenCalled();
});
it("loads only this activity and reports database failure distinctly", async () => {
  expect((await EventLodgingSettings({ eventSlug: "trip" })).props.status).toBe("ready");
  expect(loadCatalog).toHaveBeenCalledWith("trip");
  vi.mocked(loadCatalog).mockRejectedValue(new Error("missing migration"));
  expect((await EventLodgingSettings({ eventSlug: "trip" })).props.status).toBe("error");
});
