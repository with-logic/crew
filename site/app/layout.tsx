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
  title: "crew — a package manager for teams to share agent skills",
  description:
    "Share skills across your team in a standard way that keeps them up to date with zero effort. One command to install. The same skills on every laptop, in every coding agent.",
  openGraph: {
    title: "crew — a package manager for teams to share agent skills",
    description:
      "Share skills across your team in a standard way. One command to install. The same skills on every laptop, in every coding agent. Updates arrive in the background.",
    type: "website",
    url: "https://crew.logic.inc",
  },
  twitter: {
    card: "summary_large_image",
    title: "crew — a package manager for teams to share agent skills",
    description:
      "Share skills across your team in a standard way. One command to install. The same skills on every laptop, in every coding agent.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
