import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Archivo, Azeret_Mono, Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { GridFidget } from "../components/primitives/GridFidget";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const azeretMono = Azeret_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

const SITE_DESCRIPTION =
  "Install personal skills, team taps, and git-hosted skill collections into every agent on macOS or Linux. An open-source project by Logic, Inc.";

export const metadata: Metadata = {
  metadataBase: new URL("https://crew.logic.inc"),
  title: "homecrew — package manager for agent skills",
  description: SITE_DESCRIPTION,
  openGraph: {
    title: "homecrew — package manager for agent skills",
    description: SITE_DESCRIPTION,
    type: "website",
    url: "https://crew.logic.inc",
  },
  twitter: {
    card: "summary_large_image",
    title: "homecrew — package manager for agent skills",
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${instrumentSans.variable} ${azeretMono.variable}`}
    >
      <body>
        <GridFidget />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
