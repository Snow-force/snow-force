import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LanguageProvider, useLanguage } from "./language";

function LanguageProbe() {
  const { lang, t } = useLanguage();

  return <output>{`${lang}:${t({ en: "Events", zh: "当前活动" })}`}</output>;
}

afterEach(() => {
  document.cookie = "lang=;path=/;max-age=0";
});

describe("LanguageProvider", () => {
  it("uses the explicit server seed instead of a conflicting client cookie", () => {
    // Given: the server resolved the request cookie as Chinese.
    document.cookie = "lang=en;path=/";

    // When: the client hydrates with the server-provided seed.
    render(
      <LanguageProvider initialLang="zh">
        <LanguageProbe />
      </LanguageProvider>,
    );

    // Then: the first client render preserves the server language, not document.cookie.
    expect(screen.getByText("zh:当前活动")).toBeInTheDocument();
  });

  it("uses the client cookie when existing callers omit the seed", () => {
    // Given: an existing caller without a server-provided seed.
    document.cookie = "lang=zh;path=/";

    // When: it renders the provider.
    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>,
    );

    // Then: it preserves the legacy client-only cookie initialization.
    expect(screen.getByText("zh:当前活动")).toBeInTheDocument();
  });
});
