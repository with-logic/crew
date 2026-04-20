import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
