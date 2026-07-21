import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminTranslationItem, AdminTranslationResult } from "@/lib/admin/translation";
import { LanguageProvider } from "@/lib/language";
import { AdminTranslateMissingButton } from "./admin-translate-missing-button";

type TranslationRequestBody = {
  readonly items: readonly AdminTranslationItem[];
};

function renderWithLanguage(ui: React.ReactNode) {
  document.cookie = "lang=en;path=/";
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

function missingItems(count: number): AdminTranslationItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `field.${index}`,
    value: `source ${index}`,
  }));
}

function readRequestBody(init: RequestInit | undefined): TranslationRequestBody {
  if (typeof init?.body !== "string") {
    throw new Error("Expected JSON request body.");
  }

  const payload: unknown = JSON.parse(init.body);
  if (payload === null || typeof payload !== "object" || !Array.isArray((payload as { items?: unknown }).items)) {
    throw new Error("Expected translation items.");
  }

  return { items: (payload as { items: AdminTranslationItem[] }).items };
}

async function clickTranslateButton() {
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: "中文 -> English" }));
  });
}

describe("AdminTranslateMissingButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits missing translation items in chunks of at most 50 and applies every result", async () => {
    const requests: TranslationRequestBody[] = [];
    vi.stubGlobal(
      "fetch",
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = readRequestBody(init);
        requests.push(body);
        return new Response(
          JSON.stringify({
            translations: body.items.map((item) => ({ id: item.id, value: `translated ${item.id}` })),
          }),
          { status: 200 },
        );
      },
    );
    const onApply = vi.fn<[AdminTranslationResult[]], void>();

    renderWithLanguage(
      <AdminTranslateMissingButton sourceLang="zh" targetLang="en" items={missingItems(55)} onApply={onApply} />,
    );

    await clickTranslateButton();

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(requests.map((request) => request.items.length)).toEqual([50, 5]);
    expect(onApply).toHaveBeenCalledWith(
      Array.from({ length: 55 }, (_, index) => ({
        id: `field.${index}`,
        value: `translated field.${index}`,
      })),
    );
    expect(screen.getByText("Filled 55 fields.")).toBeInTheDocument();
  });

  it("does not apply partial translations when a later chunk fails", async () => {
    const requests: TranslationRequestBody[] = [];
    vi.stubGlobal(
      "fetch",
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = readRequestBody(init);
        requests.push(body);
        if (requests.length === 2) {
          return new Response(JSON.stringify({ message: "Chunk failed." }), { status: 503 });
        }

        return new Response(
          JSON.stringify({
            translations: body.items.map((item) => ({ id: item.id, value: `translated ${item.id}` })),
          }),
          { status: 200 },
        );
      },
    );
    const onApply = vi.fn<[AdminTranslationResult[]], void>();

    renderWithLanguage(
      <AdminTranslateMissingButton sourceLang="zh" targetLang="en" items={missingItems(55)} onApply={onApply} />,
    );

    await clickTranslateButton();

    await waitFor(() => expect(screen.getByText("Chunk failed.")).toBeInTheDocument());
    expect(requests.map((request) => request.items.length)).toEqual([50, 5]);
    expect(onApply).not.toHaveBeenCalled();
  });
});
