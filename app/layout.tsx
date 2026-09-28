import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PWB Bot",
  description: "Pro Wrestling Bosphorus operasyon paneli",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
