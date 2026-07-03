import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { I18nProvider } from "@/lib/i18n/client";
import { translate } from "@/lib/i18n/messages";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();

  if (session?.user) {
    redirect("/projects");
  }
  const [dictionary, locale, { error }] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const t = (path: string) => translate(dictionary, path);
  const errorKey =
    error === "access_requested"
      ? "login.errorAccessRequested"
      : error === "not_authorized"
        ? "login.errorNotAuthorized"
        : error === "discord_email"
          ? "login.errorDiscordEmail"
          : error
            ? "login.errorGeneric"
            : null;
  const isNotice = error === "access_requested";

  return (
    <I18nProvider dictionary={dictionary} locale={locale}>
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-fg">
        <section className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-2xl shadow-black/30">
          <div className="mb-6">
            <p className="text-sm font-medium uppercase tracking-wide text-danger-fg">{t("app.brand")}</p>
            <h1 className="mt-2 text-2xl font-semibold text-fg-strong">{t("login.title")}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{t("login.subtitle")}</p>
          </div>
          {errorKey ? (
            <div
              className={[
                "mb-4 rounded-md border px-3 py-2 text-sm",
                isNotice
                  ? "border-line-strong bg-elevated text-fg-strong"
                  : "border-danger bg-danger-soft text-danger-fg"
              ].join(" ")}
            >
              {t(errorKey)}
            </div>
          ) : null}
          <LoginForm discordEnabled={Boolean(process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET)} />
        </section>
      </main>
    </I18nProvider>
  );
}
