import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/language";
import { EventShareBar } from "./event-share-bar";

vi.mock("@/lib/events/share-actions", () => ({
  getQrCodeDataUrl: vi.fn().mockResolvedValue({ dataUrl: "data:image/png;base64,abc" }),
}));

function renderWithLanguage(ui: React.ReactNode) {
  document.cookie = "lang=en;path=/";
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("EventShareBar", () => {
  let writeTextSpy: ReturnType<typeof vi.spyOn>;

  function setupClipboardMock() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "navigator", {
      get: () => ({ clipboard: { writeText } }),
      configurable: true,
    });
    writeTextSpy = writeText as unknown as ReturnType<typeof vi.spyOn>;
  }

  it("renders Share, Copy Link, and QR buttons", () => {
    renderWithLanguage(<EventShareBar slug="tahoe-trip-2026" title="Tahoe Trip" />);

    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /qr/i })).toBeInTheDocument();
  });

  it("copies the event link to the clipboard when Copy Link is clicked", async () => {
    const user = userEvent.setup();
    setupClipboardMock();
    renderWithLanguage(<EventShareBar slug="tahoe-trip-2026" title="Tahoe Trip" />);

    await user.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining("/events/tahoe-trip-2026"));
    });
  });

  it("opens a QR modal with an image when the QR button is clicked", async () => {
    const user = userEvent.setup();
    renderWithLanguage(<EventShareBar slug="tahoe-trip-2026" title="Tahoe Trip" />);

    await user.click(screen.getByRole("button", { name: /qr/i }));

    const qrImage = await screen.findByAltText(/qr code/i);
    expect(qrImage).toBeInTheDocument();
    expect(qrImage).toHaveAttribute("src", expect.stringMatching(/^data:image\/png;base64,/));
  });

  it("falls back to copying the link when Share is clicked and navigator.share is unavailable", async () => {
    const user = userEvent.setup();
    setupClipboardMock();
    renderWithLanguage(<EventShareBar slug="tahoe-trip-2026" title="Tahoe Trip" />);

    await user.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining("/events/tahoe-trip-2026"));
    });
  });

  it("closes the QR modal when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderWithLanguage(<EventShareBar slug="tahoe-trip-2026" title="Tahoe Trip" />);

    await user.click(screen.getByRole("button", { name: /qr/i }));
    const qrImage = await screen.findByAltText(/qr code/i);
    expect(qrImage).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByAltText(/qr code/i)).not.toBeInTheDocument();
    });
  });

  it("renders light-tone buttons with dark text on a light background", () => {
    renderWithLanguage(<EventShareBar slug="tahoe-trip-2026" title="Tahoe Trip" tone="light" />);

    const button = screen.getByRole("button", { name: /share/i });
    expect(button.className).toContain("text-[#1d1d1f]");
    expect(button.className).not.toContain("text-white/80");
  });
});
