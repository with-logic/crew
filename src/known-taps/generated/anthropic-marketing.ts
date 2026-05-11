/**
 * Generated known-tap registry data for anthropic-marketing (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_MARKETING_KNOWN_TAP = {
  "name": "anthropic-marketing",
  "url": "https://github.com/anthropics/knowledge-work-plugins.git",
  "subpath": "marketing",
  "description": "Anthropic knowledge-work skills for campaign planning, content, email sequences, competitive briefs, SEO, and reporting.",
  "trust": "official",
  "skills": [
    {
      "name": "brand-review",
      "namespace": null,
      "description": "Review content against your brand voice, style guide, and messaging pillars, flagging deviations by severity with specific before/after fixes. Use when checking a draft before it ships, when auditing copy for voice consistency and terminology, or when screening for unsubstantiated claims, missing disclaimers, and other legal flags.",
      "path": "skills/brand-review"
    },
    {
      "name": "campaign-plan",
      "namespace": null,
      "description": "Generate a full campaign brief with objectives, audience, messaging, channel strategy, content calendar, and success metrics. Use when planning a product launch, lead-gen push, or awareness campaign, when you need a week-by-week content calendar with dependencies, or when translating a marketing goal into a structured, executable plan.",
      "path": "skills/campaign-plan"
    },
    {
      "name": "competitive-brief",
      "namespace": null,
      "description": "Research competitors and generate a positioning and messaging comparison with content gaps, opportunities, and threats. Use when building sales battlecards, when finding positioning gaps and messaging angles competitors haven't claimed, or when a competitor makes a move and you need to assess the impact.",
      "path": "skills/competitive-brief"
    },
    {
      "name": "content-creation",
      "namespace": null,
      "description": "Draft marketing content across channels — blog posts, social media, email newsletters, landing pages, press releases, and case studies. Use when writing any marketing content, when you need channel-specific formatting, SEO-optimized copy, headline options, or calls to action.",
      "path": "skills/content-creation"
    },
    {
      "name": "draft-content",
      "namespace": null,
      "description": "Draft blog posts, social media, email newsletters, landing pages, press releases, and case studies with channel-specific formatting and SEO recommendations. Use when writing any marketing content, when you need headline or subject line options, or when adapting a message for a specific platform, audience, and brand voice.",
      "path": "skills/draft-content"
    },
    {
      "name": "email-sequence",
      "namespace": null,
      "description": "Design and draft multi-email sequences with full copy, timing, branching logic, exit conditions, and performance benchmarks. Use when building onboarding, lead nurture, re-engagement, win-back, or product launch flows, when you need a complete drip campaign with A/B test suggestions, or when mapping a sequence end-to-end with a flow diagram.",
      "path": "skills/email-sequence"
    },
    {
      "name": "performance-report",
      "namespace": null,
      "description": "Build a marketing performance report with key metrics, trend analysis, wins and misses, and prioritized optimization recommendations. Use when wrapping a campaign, when preparing weekly, monthly, or quarterly channel summaries for stakeholders, or when you need data translated into an executive summary with next-period priorities.",
      "path": "skills/performance-report"
    },
    {
      "name": "seo-audit",
      "namespace": null,
      "description": "Run a comprehensive SEO audit — keyword research, on-page analysis, content gaps, technical checks, and competitor comparison. Use when assessing a site's SEO health, when finding keyword opportunities and content gaps competitors own, or when you need a prioritized action plan split into quick wins and strategic investments.",
      "path": "skills/seo-audit"
    }
  ]
} as const satisfies KnownTap;
