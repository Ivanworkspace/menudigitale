import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: publicEnv.brandName, template: `%s · ${publicEnv.brandName}` },
  description: "Menu digitale e gestione del ristorante",
  applicationName: publicEnv.brandName,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
