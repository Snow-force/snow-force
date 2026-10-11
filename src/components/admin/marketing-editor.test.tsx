import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarketingEditor } from "./marketing-editor";
const campaign = { id: "123e4567-e89b-42d3-a456-426614174001", source: { kind: "event", id: "future-ride" }, content: { subject: "Future ride", preheader: "Mammoth", heading: "Join us", body: "Ride together", image: "", button: "View event", path: "/events/future-ride" }, version: 1, status: "draft", created_at: "2026-10-01T00:00:00Z" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("requires saved content, a reviewed audience and explicit confirmation before sending", async () => {
  const commands: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    const command = JSON.parse(options.body) as Record<string, unknown>; commands.push(command);
    const result = command.action === "list" ? { campaigns: [campaign], ready: true } : command.action === "preview" ? { campaign, counts: { total: 3, eligible: 1, pending: 1, suppressed: 1 }, audienceHash: "a".repeat(64), publishable: true, preview: { html: "<h1>Preview</h1>", text: "Preview" } } : command.action === "send" ? { campaign: { ...campaign, status: "queued" }, stats: [{ status: "queued", count: 1 }] } : { campaign };
    return new Response(JSON.stringify(result), { status: 200 });
  }));
  render(<MarketingEditor endpoint="/admin/events/promotion/api" surface="event" />);
  fireEvent.click(await screen.findByRole("button", { name: /Future ride/ }));
  await screen.findByLabelText("Subject / 邮件主题");
  fireEvent.change(screen.getByLabelText("Subject / 邮件主题"), { target: { value: "Edited title" } });
  expect(screen.getByRole("button", { name: /Preview and audience/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Subject / 邮件主题"), { target: { value: "Future ride" } });
  fireEvent.click(screen.getByRole("button", { name: /Preview and audience/ }));
  await screen.findByTitle("Email preview");
  expect(screen.getByRole("button", { name: /Confirm delivery/ })).toBeDisabled();
  expect(screen.getByText(/Eligible \/ 可发送 1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /Confirm delivery/ }));
  await screen.findByText(/Campaign queued/);
  expect(commands.filter(command => command.action === "send")).toHaveLength(1);
  expect(commands.find(command => command.action === "send")).toMatchObject({ version: 1, audienceHash: "a".repeat(64) });
});
it("keeps sending disabled when delivery is unconfigured and reports errors", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ campaigns: [], ready: false }))));
  render(<MarketingEditor endpoint="/admin/snowforce/marketing" surface="shop" initialSource="prod_gear" />);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sending is disabled"));
  expect(screen.getByLabelText("Source type")).toHaveValue("product");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
  fireEvent.click(screen.getByRole("button", { name: /Generate draft/ }));
  await screen.findByRole("alert");
});
