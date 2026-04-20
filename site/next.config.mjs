/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static-only landing page; no server components with runtime work,
  // no API routes. Output a fully-static site that Vercel can edge-cache.
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
