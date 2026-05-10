/**
 * Generated known-tap registry data for supabase (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const SUPABASE_KNOWN_TAP = {
  "name": "supabase",
  "url": "https://github.com/supabase/agent-skills.git",
  "subpath": "skills",
  "description": "Supabase skills for Supabase development, Postgres best practices, Auth, Storage, Realtime, and Edge Functions.",
  "trust": "official",
  "skills": [
    {
      "name": "supabase",
      "namespace": null,
      "description": "Use when doing ANY task involving Supabase. Triggers: Supabase products (Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues); client libraries and SSR integrations (supabase-js, @supabase/ssr) in Next.js, React, SvelteKit, Astro, Remix; auth issues (login, logout, sessions, JWT, cookies, getSession, getUser, getClaims, RLS); Supabase CLI or MCP server; schema changes, migrations, security audits, Postgres extensions (pg_graphql, pg_cron, pg_vector).",
      "path": "supabase"
    },
    {
      "name": "supabase-postgres-best-practices",
      "namespace": null,
      "description": "Postgres performance optimization and best practices from Supabase. Use this skill when writing, reviewing, or optimizing Postgres queries, schema designs, or database configurations.",
      "path": "supabase-postgres-best-practices"
    }
  ]
} as const satisfies KnownTap;
