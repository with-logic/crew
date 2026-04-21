import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://crew.logic.inc"),
  title: "crew — helps teams share agent skills",
  description:
    "Easily share skills across your team. One command to install. The same skills on every laptop, in every coding agent. Updated automatically.",
  openGraph: {
    title: "crew — helps teams share agent skills",
    description:
      "Easily share skills across your team. One command to install. The same skills on every laptop, in every coding agent. Updated automatically.",
    type: "website",
    url: "https://crew.logic.inc",
  },
  twitter: {
    card: "summary_large_image",
    title: "crew — helps teams share agent skills",
    description:
      "Easily share skills across your team. One command to install. The same skills on every laptop, in every coding agent.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
