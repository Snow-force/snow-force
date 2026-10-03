import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/members/actions", () => ({ getCurrentMemberAccount: vi.fn() }));
vi.mock("./shipping-address-repository", () => ({ shippingAddressRepository: { save: vi.fn(), remove: vi.fn() } }));
import { revalidatePath } from "next/cache";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { previewAddresses, previewProfile, previewUser } from "@/lib/members/member-center-preview";
import { shippingAddressRepository } from "./shipping-address-repository";
import { deleteShippingAddressAction, saveShippingAddressAction } from "./member-actions";

const account = { profile: previewProfile, user: previewUser, privacyAccepted: true, emailConfirmed: true };
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries(previewAddresses[0])) if (key !== "id") data.set(key, String(value));
  return data;
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getCurrentMemberAccount).mockResolvedValue(account); vi.mocked(shippingAddressRepository.save).mockResolvedValue(previewAddresses[0]); vi.mocked(shippingAddressRepository.remove).mockResolvedValue(true); });

describe("member shipping address actions", () => {
  it("uses the verified auth UUID even if a form names a different owner", async () => {
    const data = form(); data.set("user_id", "someone-else");
    expect(await saveShippingAddressAction(data)).toEqual({ success: true });
    expect(shippingAddressRepository.save).toHaveBeenCalledWith(previewUser.id, expect.not.objectContaining({ userId: "someone-else" }));
    expect(revalidatePath).toHaveBeenCalledWith("/member/addresses");
  });
  it("rejects unauthenticated and unverified users before persistence", async () => {
    vi.mocked(getCurrentMemberAccount).mockResolvedValue(null);
    expect(await saveShippingAddressAction(form())).toMatchObject({ success: false, error: "auth" });
    vi.mocked(getCurrentMemberAccount).mockResolvedValue({ ...account, emailConfirmed: false });
    expect(await saveShippingAddressAction(form())).toMatchObject({ success: false, error: "verification" });
    expect(shippingAddressRepository.save).not.toHaveBeenCalled();
  });
  it("keeps the consent gate and rejects malformed fields", async () => {
    vi.mocked(getCurrentMemberAccount).mockResolvedValue({ ...account, privacyAccepted: false });
    expect((await saveShippingAddressAction(form())).error).toBe("auth");
    vi.mocked(getCurrentMemberAccount).mockResolvedValue(account);
    const data = form(); data.set("postalCode", "not-a-zip");
    expect(await saveShippingAddressAction(data)).toMatchObject({ success: false, error: "validation", fields: ["postalCode"] });
    expect(shippingAddressRepository.save).not.toHaveBeenCalled();
  });
  it("does not report failed writes as successful", async () => {
    vi.mocked(shippingAddressRepository.save).mockResolvedValue(null);
    expect(await saveShippingAddressAction(form())).toMatchObject({ success: false, error: "save" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("checks identity for deletion and reports a missing or foreign address as failure", async () => {
    vi.mocked(shippingAddressRepository.remove).mockResolvedValue(false);
    expect(await deleteShippingAddressAction(previewAddresses[0].id)).toMatchObject({ success: false, error: "delete" });
    expect(shippingAddressRepository.remove).toHaveBeenCalledWith(previewUser.id, previewAddresses[0].id);
    vi.mocked(getCurrentMemberAccount).mockResolvedValue(null);
    await deleteShippingAddressAction(previewAddresses[0].id);
    expect(shippingAddressRepository.remove).toHaveBeenCalledTimes(1);
  });
  it("revalidates after a successful deletion and denies unverified deletion", async () => {
    expect(await deleteShippingAddressAction(previewAddresses[0].id)).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledWith("/member/addresses");
    expect(revalidatePath).toHaveBeenCalledWith("/member");
    vi.clearAllMocks();
    vi.mocked(getCurrentMemberAccount).mockResolvedValue({ ...account, emailConfirmed: false });
    expect(await deleteShippingAddressAction(previewAddresses[0].id)).toEqual({ success: false, error: "verification" });
    expect(shippingAddressRepository.remove).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
