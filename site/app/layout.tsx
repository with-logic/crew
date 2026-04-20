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
  title: "crew — a package manager for agent skills",
  description:
    "Find great skills. Install them with one command into every coding agent on your machine. Publish your own as easily as pushing to GitHub.",
  openGraph: {
    title: "crew — a package manager for agent skills",
    description:
      "Find great skills. Install them with one command into every coding agent on your machine.",
    type: "website",
    url: "https://crew.logic.inc",
  },
  twitter: {
    card: "summary_large_image",
    title: "crew — a package manager for agent skills",
    description:
      "Find great skills. Install them with one command into every coding agent on your machine.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
