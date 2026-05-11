import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Draft & Cut",
  description: "Draft & Cut"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
