import en from "@/config/i18n/en.json";
import es from "@/config/i18n/es.json";

export const dictionaries = { es, en };
export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export type Dictionary = typeof es;

export function isLocale(value: string | undefined): value is Locale {
  return Boolean(value && locales.includes(value as Locale));
}

export function getDictionaryByLocale(locale: Locale) {
  return dictionaries[locale];
}

export function translate(dictionary: Dictionary, path: string, replacements?: Record<string, string | number>) {
  const value = path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, dictionary);
  const template = typeof value === "string" ? value : path;

  if (!replacements) {
    return template;
  }

  return Object.entries(replacements).reduce(
    (text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)),
    template
  );
}

export function optionLabel(dictionary: Dictionary, group: string, value: string) {
  return translate(dictionary, `options.${group}.${value}`);
}
