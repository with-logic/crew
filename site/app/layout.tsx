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
  title: "homecrew — package manager for agent skills",
  description:
    "Install, share, and update agent skills across Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Goose, and more.",
  openGraph: {
    title: "homecrew — package manager for agent skills",
    description:
      "Install personal skills, team taps, and git-hosted skill collections into every agent on your Mac.",
    type: "website",
    url: "https://crew.logic.inc",
  },
  twitter: {
    card: "summary_large_image",
    title: "homecrew — package manager for agent skills",
    description:
      "Install personal skills, team taps, and git-hosted skill collections into every agent on your Mac.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
