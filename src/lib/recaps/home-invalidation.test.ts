import { describe, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => ({ revalidatePath: vi.fn(), requireAdmin: vi.fn(), update: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: effects.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("../auth/admin", () => ({ requireAdmin: effects.requireAdmin }));
vi.mock("../events/repository", () => ({ updateEvent: vi.fn() }));
vi.mock("./repository", () => ({ updateRecap: effects.update, insertRecap: vi.fn(), getRecapAdmin: vi.fn() }));
vi.mock("../supabase/server", () => ({ createAdminClient: vi.fn() }));
import { updateRecapAction } from "./actions";

describe("public homepage recap invalidation", () => {
  it("invalidates cached homepage summaries after staff saves a recap", async () => {
    const form = new FormData();
    form.set("slug", "snow-day");
    form.set("title.en", "Snow day");
    form.set("title.zh", "雪山日");
    await expect(updateRecapAction(form)).rejects.toThrow("redirect");
    expect(effects.requireAdmin).toHaveBeenCalled();
    expect(effects.update).toHaveBeenCalledWith("snow-day", expect.objectContaining({ title: { en: "Snow day", zh: "雪山日" } }));
    expect(effects.revalidatePath).toHaveBeenCalledWith("/");
    expect(effects.revalidatePath).toHaveBeenCalledWith("/recaps/snow-day");
  });
});
