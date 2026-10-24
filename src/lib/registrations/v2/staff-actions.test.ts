import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ staff: vi.fn(), event: vi.fn(), rpc: vi.fn(), queue: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: m.staff }));
vi.mock("@/lib/events/repository", () => ({ getEventAdmin: m.event }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc: m.rpc }) }));
vi.mock("./delivery", () => ({ queueWaiverInvitation: m.queue, dispatchWaiverOutbox: m.dispatch }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { saveWaiverPolicyAction, staffWaiverOperationAction } from "./staff-actions";
function policyForm() { const form = new FormData(); form.set("eventSlug", "event"); form.set("adultText", "Adult personal risk acknowledgement and reviewed event terms. ".repeat(4)); form.set("guardianText", "Parent and legal guardian event terms, reviewed for a minor child. ".repeat(4)); form.set("legalReviewed", "on"); form.set("timeZone", "America/Los_Angeles"); return form; }
beforeEach(() => { vi.resetAllMocks(); m.staff.mockResolvedValue({ userId: "staff" }); m.event.mockResolvedValue({ slug: "event", eventDate: "2099-01-01" }); m.rpc.mockResolvedValue({ error: null }); });
afterEach(() => vi.unstubAllEnvs());
it("authorizes staff before viewing policies, queuing mail or changing signatures", async () => {
  m.staff.mockRejectedValue(new Error("staff required")); await expect(saveWaiverPolicyAction(policyForm())).rejects.toThrow("staff required"); await expect(staffWaiverOperationAction(new FormData())).rejects.toThrow("staff required"); expect(m.event).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled(); expect(m.queue).not.toHaveBeenCalled();
});
it("requires reviewed adult/guardian terms and prevents enabling with incomplete delivery configuration", async () => {
  const form = policyForm(); form.delete("legalReviewed"); await expect(saveWaiverPolicyAction(form)).rejects.toThrow("error=policy");
  form.set("legalReviewed", "on"); form.set("enabled", "on"); vi.stubEnv("EVENT_WAIVER_ENCRYPTION_KEY", ""); await expect(saveWaiverPolicyAction(form)).rejects.toThrow("error=configuration"); expect(m.rpc).not.toHaveBeenCalled();
});
it("can save a reviewed disabled policy without sending any emails or enabling a feature", async () => {
  await expect(saveWaiverPolicyAction(policyForm())).rejects.toThrow("saved=1"); expect(m.rpc).toHaveBeenCalledWith("save_event_waiver_policy", expect.objectContaining({ actor_input: "staff", group_enabled_input: false, email_required_input: false, adult_sha_input: expect.stringMatching(/^[a-f0-9]{64}$/) })); expect(m.queue).not.toHaveBeenCalled();
});
it("requires explicit identity checking for guardian review and check-in", async () => {
  const form = new FormData(); form.set("eventSlug", "event"); form.set("registrationId", "ticket");
  for (const operation of ["checkin", "guardian_verified", "identity_verified"]) { form.set("operation", operation); await expect(staffWaiverOperationAction(form)).rejects.toThrow("error=operation"); }
  expect(m.rpc).not.toHaveBeenCalled(); form.set("identityChecked", "on"); await expect(staffWaiverOperationAction(form)).rejects.toThrow("saved=1"); expect(m.rpc).toHaveBeenCalledWith("staff_event_waiver_operation", { registration_id_input: "ticket", operation_input: "identity_verified", actor_input: "staff" });
});
