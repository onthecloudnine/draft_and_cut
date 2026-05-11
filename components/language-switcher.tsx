"use client";

import { useRouter } from "next/navigation";
import { locales, type Locale } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/client";

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, t } = useI18n();

  function changeLocale(nextLocale: Locale) {
    document.cookie = `dc_locale=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <label className="hidden items-center gap-2 text-xs font-medium text-slate-400 sm:flex">
      {t("app.language")}
      <select
        className="h-8 rounded-md border border-neutral-700 bg-black px-2 text-xs text-slate-100"
        onChange={(event) => changeLocale(event.target.value as Locale)}
        value={locale}
      >
        {locales.map((item) => (
          <option key={item} value={item}>
            {item.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
