/**
 * Generated known-tap registry data for cloudflare (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const CLOUDFLARE_KNOWN_TAP = {
  "name": "cloudflare",
  "url": "https://github.com/cloudflare/skills.git",
  "subpath": "skills",
  "description": "Cloudflare skills for Workers, Wrangler, Durable Objects, performance, and edge application work.",
  "trust": "official",
  "skills": [
    {
      "name": "agents-sdk",
      "namespace": null,
      "description": "Build AI agents on Cloudflare Workers using the Agents SDK. Load when creating stateful agents, durable workflows, real-time WebSocket apps, scheduled tasks, MCP servers, chat applications, voice agents, or browser automation. Covers Agent class, state management, callable RPC, Workflows, durable execution, queues, retries, observability, and React hooks. Biases towards retrieval from Cloudflare docs over pre-trained knowledge.",
      "path": "agents-sdk"
    },
    {
      "name": "cloudflare",
      "namespace": null,
      "description": "Comprehensive Cloudflare platform skill covering Workers, Pages, storage (KV, D1, R2), AI (Workers AI, Vectorize, Agents SDK), feature flags (Flagship), networking (Tunnel, Spectrum), security (WAF, DDoS), and infrastructure-as-code (Terraform, Pulumi). Use for any Cloudflare development task. Biases towards retrieval from Cloudflare docs over pre-trained knowledge.",
      "path": "cloudflare"
    },
    {
      "name": "cloudflare-email-service",
      "namespace": null,
      "description": "Send and receive transactional emails with Cloudflare Email Service (Email Sending + Email Routing). Use when building email sending (Workers binding or REST API), email routing, Agents SDK email handling, or integrating email into any app — Workers, Node.js, Python, Go, etc. Also use for email deliverability, SPF/DKIM/DMARC, wrangler email setup, MCP email tools, or when a coding agent needs to send emails. Even for simple requests like \"add email to my Worker\" — this skill has critical config details.",
      "path": "cloudflare-email-service"
    },
    {
      "name": "durable-objects",
      "namespace": null,
      "description": "Create and review Cloudflare Durable Objects. Use when building stateful coordination (chat rooms, multiplayer games, booking systems), implementing RPC methods, SQLite storage, alarms, WebSockets, or reviewing DO code for best practices. Covers Workers integration, wrangler config, and testing with Vitest. Biases towards retrieval from Cloudflare docs over pre-trained knowledge.",
      "path": "durable-objects"
    },
    {
      "name": "sandbox-sdk",
      "namespace": null,
      "description": "Build sandboxed applications for secure code execution. Load when building AI code execution, code interpreters, CI/CD systems, interactive dev environments, or executing untrusted code. Covers Sandbox SDK lifecycle, commands, files, code interpreter, and preview URLs. Biases towards retrieval from Cloudflare docs over pre-trained knowledge.",
      "path": "sandbox-sdk"
    },
    {
      "name": "web-perf",
      "namespace": null,
      "description": "Analyzes web performance using Chrome DevTools MCP. Measures Core Web Vitals (LCP, INP, CLS) and supplementary metrics (FCP, TBT, Speed Index), identifies render-blocking resources, network dependency chains, layout shifts, caching issues, and accessibility gaps. Use when asked to audit, profile, debug, or optimize page load performance, Lighthouse scores, or site speed. Biases towards retrieval from current documentation over pre-trained knowledge.",
      "path": "web-perf"
    },
    {
      "name": "workers-best-practices",
      "namespace": null,
      "description": "Reviews and authors Cloudflare Workers code against production best practices. Load when writing new Workers, reviewing Worker code, configuring wrangler.jsonc, or checking for common Workers anti-patterns (streaming, floating promises, global state, secrets, bindings, observability). Biases towards retrieval from Cloudflare docs over pre-trained knowledge.",
      "path": "workers-best-practices"
    },
    {
      "name": "wrangler",
      "namespace": null,
      "description": "Cloudflare Workers CLI for deploying, developing, and managing Workers, KV, R2, D1, Vectorize, Hyperdrive, Workers AI, Containers, Queues, Workflows, Pipelines, and Secrets Store. Load before running wrangler commands to ensure correct syntax and best practices. Biases towards retrieval from Cloudflare docs over pre-trained knowledge.",
      "path": "wrangler"
    }
  ]
} as const satisfies KnownTap;
