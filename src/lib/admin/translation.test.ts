import { beforeEach, describe, expect, it, vi } from "vitest";

import { translateAdminItems, TranslationError } from "./translation";

describe("translateAdminItems", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends batched text to Google Cloud Translation v2 and maps results by item id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          data: {
            translations: [
              { translatedText: "English title" },
              { translatedText: "Bring gloves" },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const result = await translateAdminItems(
      {
        sourceLang: "zh",
        targetLang: "en",
        items: [
          { id: "title", value: "zh title" },
          { id: "note", value: "zh note" },
        ],
      },
      { apiKey: "secret-key", fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://translation.googleapis.com/language/translate/v2?key=secret-key");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({
      q: ["zh title", "zh note"],
      source: "zh-CN",
      target: "en",
      format: "text",
    });
    expect(result).toEqual([
      { id: "title", value: "English title" },
      { id: "note", value: "Bring gloves" },
    ]);
  });

  it("uses GOOGLE_TRANSLATE_API_KEY when no explicit api key is injected", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "env-key");
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ data: { translations: [{ translatedText: "translated" }] } }),
    );

    await translateAdminItems(
      { sourceLang: "en", targetLang: "zh", items: [{ id: "a", value: "hello" }] },
      { fetchImpl },
    );

    expect(String(fetchImpl.mock.calls[0][0])).toContain("key=env-key");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).target).toBe("zh-CN");
  });

  it("rejects invalid requests before calling Google", async () => {
    const fetchImpl = vi.fn();

    await expect(
      translateAdminItems(
        { sourceLang: "zh", targetLang: "zh", items: [{ id: "a", value: "hello" }] },
        { apiKey: "key", fetchImpl },
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });

    await expect(
      translateAdminItems({ sourceLang: "zh", targetLang: "en", items: [] }, { apiKey: "key", fetchImpl }),
    ).rejects.toMatchObject({ code: "invalid_request" });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a clear error when the Google API key is missing", async () => {
    await expect(
      translateAdminItems({
        sourceLang: "zh",
        targetLang: "en",
        items: [{ id: "title", value: "zh title" }],
      }),
    ).rejects.toEqual(new TranslationError("missing_key", "GOOGLE_TRANSLATE_API_KEY is not configured."));
  });

  it("wraps Google API failures and response shape mismatches", async () => {
    await expect(
      translateAdminItems(
        { sourceLang: "zh", targetLang: "en", items: [{ id: "title", value: "zh title" }] },
        {
          apiKey: "key",
          fetchImpl: vi.fn(async () => Response.json({ error: { message: "quota exceeded" } }, { status: 403 })),
        },
      ),
    ).rejects.toMatchObject({ code: "api_error", message: "quota exceeded" });

    await expect(
      translateAdminItems(
        { sourceLang: "zh", targetLang: "en", items: [{ id: "title", value: "zh title" }] },
        {
          apiKey: "key",
          fetchImpl: vi.fn(async () => Response.json({ data: { translations: [] } })),
        },
      ),
    ).rejects.toMatchObject({ code: "response_mismatch" });
  });
});
