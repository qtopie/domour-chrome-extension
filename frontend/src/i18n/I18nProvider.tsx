import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  type Lang,
  I18N_STORAGE_KEY,
  detectLang,
  makeTranslator
} from "./index";
import { zh } from "./locales/zh";
import { en } from "./locales/en";

export type { Lang };

interface I18nContextValue {
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLang: (l: "auto" | Lang) => void;
  override: "auto" | Lang;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function storageGet(cb: (v: Record<string, any>) => void) {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.get([I18N_STORAGE_KEY], cb);
  } else {
    cb({});
  }
}

function storageSet(v: string) {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.set({ [I18N_STORAGE_KEY]: v }, () => {});
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<"auto" | Lang>("auto");
  const navLang =
    typeof navigator !== "undefined" ? navigator.language : "en";

  useEffect(() => {
    storageGet((res) => {
      const v = res?.[I18N_STORAGE_KEY];
      if (v && (v === "zh-CN" || v === "en" || v === "auto")) setOverride(v);
    });
  }, []);

  const lang = useMemo(() => detectLang(navLang, override), [navLang, override]);
  const t = useMemo(
    () => makeTranslator(lang, zh, en),
    [lang]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      t,
      override,
      setLang: (l) => {
        setOverride(l);
        if (l === "auto") storageSet("auto");
        else storageSet(l);
      },
    }),
    [lang, t, override]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback when used outside provider (e.g. tests): return key itself.
    return {
      lang: detectLang(typeof navigator !== "undefined" ? navigator.language : "en", "auto"),
      t: (key: string) => key,
      setLang: () => {},
      override: "auto",
    };
  }
  return ctx;
}
