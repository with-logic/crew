import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // TypeScript 7 ships the Go-native compiler and no longer exposes the JS
    // compiler API Next used for its built-in typecheck, so Next wrongly
    // reports TS as "not installed". This flag makes Next shell out to the
    // TS CLI instead. Requires Next >= 16.3 (currently only on the preview
    // channel — revisit the pin once 16.3 is stable).
    useTypeScriptCli: true,
  },
  // Static-only landing page; no server components with runtime work,
  // no API routes. Output a fully-static site that Vercel can edge-cache.
  output: "export",
  images: {
    unoptimized: true,
  },
  // Pin the workspace root to site/. Otherwise Next.js walks up, finds
  // the crew CLI's bun.lock one level higher, and guesses wrong.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
