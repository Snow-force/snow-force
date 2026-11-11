import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAllRecaps: vi.fn(),
  updateRecap: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/recaps/repository", () => ({ getAllRecaps: mocks.getAllRecaps, updateRecap: mocks.updateRecap }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { POST } from "./route";

function request(slug: string, status: string) {
  return new Request("https://snowforce.test/admin/recaps/status", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ slug, status }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: "staff-1", email: "staff@example.com", role: "admin" });
  mocks.getAllRecaps.mockResolvedValue([{ slug: "opening-day", status: "published" }]);
});

describe("admin recap status route", () => {
  it("fails closed before reading or changing recap data", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("staff-required"));

    await expect(POST(request("opening-day", "published"))).rejects.toThrow("staff-required");
    expect(mocks.updateRecap).not.toHaveBeenCalled();
    expect(mocks.getAllRecaps).not.toHaveBeenCalled();
  });

  it.each(["published", "draft"])("sets %s and invalidates homepage, public and admin caches", async (status) => {
    const response = await POST(request("opening-day", status));

    expect(mocks.updateRecap).toHaveBeenCalledWith("opening-day", { status });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recaps");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/recaps/opening-day");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/recaps");
    await expect(response.json()).resolves.toEqual([{ slug: "opening-day", status: "published" }]);
  });

  it("returns the current list without updating for an invalid status", async () => {
    await POST(request("opening-day", "deleted"));

    expect(mocks.updateRecap).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
