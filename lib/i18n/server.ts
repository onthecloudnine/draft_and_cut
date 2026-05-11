import { cookies, headers } from "next/headers";
import { getDictionaryByLocale, isLocale, type Locale } from "@/lib/i18n/messages";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("dc_locale")?.value;

  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language") ?? "";
  const preferredLocale = acceptLanguage.split(",")[0]?.split("-")[0];

  return isLocale(preferredLocale) ? preferredLocale : "es";
}

export async function getDictionary() {
  return getDictionaryByLocale(await getLocale());
}
