/**
 * Pure i18n core — no chrome dependency, unit-testable with node --experimental-strip-types.
 * See specs/modules/i18n.spec.md.
 */
export type Lang = "zh-CN" | "en";
export type Dict = Record<string, string>;

/** Storage key for language preference (also used by persist tests). */
export const I18N_STORAGE_KEY = "ui_lang";

export const LANGS: Lang[] = ["zh-CN", "en"];

/**
 * Resolve the effective language from a navigator language string and an optional
 * override ('auto' | lang | undefined).
 */
export function detectLang(navigatorLang: string, override?: string): Lang {
  if (override === "zh-CN" || override === "en") return override;
  // 'auto' or missing → follow navigator
  const base = (navigatorLang || "").toLowerCase();
  return base.startsWith("zh") ? "zh-CN" : "en";
}

/** Interpolate {param} placeholders in a template string. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    return v === undefined ? `{${key}}` : String(v);
  });
}

/**
 * Build a t() function bound to a language.
 * Lookup order: current dict → other dict → key itself (never throws).
 */
export function makeTranslator(lang: Lang, zh: Dict, en: Dict) {
  const primary = lang === "zh-CN" ? zh : en;
  const fallback = lang === "zh-CN" ? en : zh;
  return (key: string, params?: Record<string, string | number>): string => {
    let text = primary[key];
    if (text === undefined) text = fallback[key];
    if (text === undefined) return key; // key itself as last resort
    return interpolate(text, params);
  };
}

/** Return keys present in only one of the two dicts (empty array = complete). */
export function assertDictComplete(zh: Dict, en: Dict): string[] {
  const missing: string[] = [];
  const all = new Set([...Object.keys(zh), ...Object.keys(en)]);
  for (const key of all) {
    if (zh[key] === undefined || en[key] === undefined) missing.push(key);
  }
  return missing;
}
