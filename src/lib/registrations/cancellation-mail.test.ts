import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
  update: vi.fn(),
  single: vi.fn(),
  after: vi.fn(),
}));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: m.send };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    rpc: m.rpc,
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        single: m.single,
        update: m.update,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve),
      };
      m.update.mockReturnValue(q);
      return q;
    },
  }),
}));
import { dispatchCancellationMail, escapeMailText } from "./cancellation-mail";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESEND_API_KEY", "test");
  m.rpc.mockResolvedValue({
    data: [
      {
        id: "mail",
        registration_id: "ticket",
        audience: "member",
        subject: "Update",
        body: "<script>bad</script>",
        attempts: 1,
      },
    ],
    error: null,
  });
  m.single.mockResolvedValue({
    data: {
      contact_email: "rider@example.test",
      contact_name: "<Rider>",
      event_slug: "event",
    },
    error: null,
  });
  m.send.mockResolvedValue({ data: { id: "provider-mail" }, error: null });
});
it("escapes member content and sends retries using a durable idempotency key", async () => {
  await dispatchCancellationMail();
  expect(m.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "rider@example.test",
      html: expect.stringContaining("&lt;script&gt;"),
    }),
    { idempotencyKey: "cancellation-mail/mail" },
  );
  expect(m.update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "sent" }),
  );
  expect(escapeMailText('"&')).toBe("&quot;&amp;");
});
it("retains temporary provider failures for retry and stops permanent failures", async () => {
  m.send.mockResolvedValueOnce({ error: { statusCode: 503 } });
  await dispatchCancellationMail();
  expect(m.update).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "queued" }),
  );
  m.send.mockResolvedValueOnce({ error: { statusCode: 422 } });
  await dispatchCancellationMail();
  expect(m.update).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "failed" }),
  );
});
