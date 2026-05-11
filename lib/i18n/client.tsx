"use client";

import { createContext, useContext } from "react";
import { optionLabel, translate, type Dictionary, type Locale } from "@/lib/i18n/messages";

type I18nContextValue = {
  dictionary: Dictionary;
  locale: Locale;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  dictionary,
  locale
}: {
  children: React.ReactNode;
  dictionary: Dictionary;
  locale: Locale;
}) {
  return <I18nContext.Provider value={{ dictionary, locale }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return {
    locale: context.locale,
    t: (path: string, replacements?: Record<string, string | number>) =>
      translate(context.dictionary, path, replacements),
    optionLabel: (group: string, value: string) => optionLabel(context.dictionary, group, value)
  };
}
