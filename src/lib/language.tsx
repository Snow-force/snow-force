"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export type Lang = "en" | "zh";

type BilingualData = { en: any; zh: any };

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (bilingual: BilingualData) => any;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLang(): Lang {
  if (typeof document === "undefined") return "en";

  const cookie = document.cookie.split("; ").find((value) => value.startsWith("lang="));
  const value = cookie?.split("=")[1];

  return value === "zh" ? "zh" : "en";
}

export function LanguageProvider({
  children,
  initialLang,
}: {
  children: ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(() => initialLang ?? getInitialLang());

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `lang=${l};path=/;max-age=${365 * 24 * 60 * 60}`;
  }, []);

  // Plain closure — avoids useCallback generic-erasure issues with bilingual arrays
  function t(bilingual: BilingualData): any {
    return bilingual[lang];
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
