export type AdminTranslationLang = "zh" | "en";

export type AdminTranslationItem = {
  id: string;
  value: string;
};

export type AdminTranslationRequest = {
  sourceLang: AdminTranslationLang;
  targetLang: AdminTranslationLang;
  items: AdminTranslationItem[];
};

export type AdminTranslationResult = AdminTranslationItem;

export type TranslationErrorCode =
  | "missing_key"
  | "invalid_request"
  | "api_error"
  | "response_mismatch";

export class TranslationError extends Error {
  constructor(
    public readonly code: TranslationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TranslationError";
  }
}

type TranslateDependencies = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

type GoogleTranslateSuccess = {
  data?: {
    translations?: Array<{
      translatedText?: unknown;
    }>;
  };
};

type GoogleTranslateFailure = {
  error?: {
    message?: unknown;
  };
};

const GOOGLE_TRANSLATE_ENDPOINT = "https://translation.googleapis.com/language/translate/v2";
const MAX_TRANSLATION_ITEMS = 50;
const MAX_REQUEST_BYTES = 128 * 1024;

function googleLang(lang: AdminTranslationLang) {
  return lang === "zh" ? "zh-CN" : "en";
}

function requestByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function validateRequest(request: AdminTranslationRequest) {
  if (request.sourceLang === request.targetLang) {
    throw new TranslationError("invalid_request", "Source and target languages must be different.");
  }

  if (request.items.length === 0) {
    throw new TranslationError("invalid_request", "At least one translation item is required.");
  }

  if (request.items.length > MAX_TRANSLATION_ITEMS) {
    throw new TranslationError("invalid_request", `Translate ${MAX_TRANSLATION_ITEMS} or fewer items at a time.`);
  }

  if (request.items.some((item) => !item.id.trim() || !item.value.trim())) {
    throw new TranslationError("invalid_request", "Each translation item requires an id and non-empty value.");
  }
}

function readTranslations(payload: GoogleTranslateSuccess, expectedCount: number) {
  const translations = payload.data?.translations;
  if (!Array.isArray(translations) || translations.length !== expectedCount) {
    throw new TranslationError("response_mismatch", "Google Translation returned an unexpected number of results.");
  }

  return translations.map((translation) => {
    if (typeof translation.translatedText !== "string") {
      throw new TranslationError("response_mismatch", "Google Translation returned a malformed result.");
    }
    return translation.translatedText;
  });
}

export async function translateAdminItems(
  request: AdminTranslationRequest,
  dependencies: TranslateDependencies = {},
): Promise<AdminTranslationResult[]> {
  validateRequest(request);

  const apiKey = dependencies.apiKey ?? process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    throw new TranslationError("missing_key", "GOOGLE_TRANSLATE_API_KEY is not configured.");
  }

  const body = {
    q: request.items.map((item) => item.value),
    source: googleLang(request.sourceLang),
    target: googleLang(request.targetLang),
    format: "text",
  };

  if (requestByteLength(body) > MAX_REQUEST_BYTES) {
    throw new TranslationError("invalid_request", "Translation request is too large.");
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const response = await fetchImpl(`${GOOGLE_TRANSLATE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as GoogleTranslateSuccess & GoogleTranslateFailure;

  if (!response.ok) {
    const message = typeof payload.error?.message === "string" ? payload.error.message : "Google Translation failed.";
    throw new TranslationError("api_error", message);
  }

  const translatedValues = readTranslations(payload, request.items.length);
  return request.items.map((item, index) => ({
    id: item.id,
    value: translatedValues[index] ?? "",
  }));
}
