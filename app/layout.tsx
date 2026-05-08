import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Draft & Cut",
  description: "Revision y versionado de animacion 3D"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
