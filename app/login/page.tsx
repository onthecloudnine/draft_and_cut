import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { I18nProvider } from "@/lib/i18n/client";
import { translate } from "@/lib/i18n/messages";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/projects");
  }
  const [dictionary, locale] = await Promise.all([getDictionary(), getLocale()]);
  const t = (path: string) => translate(dictionary, path);

  return (
    <I18nProvider dictionary={dictionary} locale={locale}>
      <main className="flex min-h-screen items-center justify-center bg-black px-4 py-10 text-slate-100">
        <section className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-2xl shadow-black/30">
          <div className="mb-6">
            <p className="text-sm font-medium uppercase tracking-wide text-red-300">{t("app.brand")}</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-50">{t("login.title")}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{t("login.subtitle")}</p>
          </div>
          <LoginForm />
        </section>
      </main>
    </I18nProvider>
  );
}
