/**
 * Generated known-tap registry data for anthropic-sales (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_SALES_KNOWN_TAP = {
  "name": "anthropic-sales",
  "url": "https://github.com/anthropics/knowledge-work-plugins.git",
  "subpath": "sales",
  "description": "Anthropic knowledge-work skills for account research, call prep, outreach, forecasting, and pipeline review.",
  "trust": "official",
  "skills": [
    {
      "name": "account-research",
      "namespace": null,
      "description": "Research a company or person and get actionable sales intel. Works standalone with web search, supercharged when you connect enrichment tools or your CRM. Trigger with \"research [company]\", \"look up [person]\", \"intel on [prospect]\", \"who is [name] at [company]\", or \"tell me about [company]\".",
      "path": "skills/account-research"
    },
    {
      "name": "call-prep",
      "namespace": null,
      "description": "Prepare for a sales call with account context, attendee research, and suggested agenda. Works standalone with user input and web research, supercharged when you connect your CRM, email, chat, or transcripts. Trigger with \"prep me for my call with [company]\", \"I'm meeting with [company] prep me\", \"call prep [company]\", or \"get me ready for [meeting]\".",
      "path": "skills/call-prep"
    },
    {
      "name": "call-summary",
      "namespace": null,
      "description": "Process call notes or a transcript — extract action items, draft follow-up email, generate internal summary. Use when pasting rough notes or a transcript after a discovery, demo, or negotiation call, drafting a customer follow-up, logging the activity for your CRM, or capturing objections and next steps for your team.",
      "path": "skills/call-summary"
    },
    {
      "name": "competitive-intelligence",
      "namespace": null,
      "description": "Research your competitors and build an interactive battlecard. Outputs an HTML artifact with clickable competitor cards and a comparison matrix. Trigger with \"competitive intel\", \"research competitors\", \"how do we compare to [competitor]\", \"battlecard for [competitor]\", or \"what's new with [competitor]\".",
      "path": "skills/competitive-intelligence"
    },
    {
      "name": "create-an-asset",
      "namespace": null,
      "description": "Generate tailored sales assets (landing pages, decks, one-pagers, workflow demos) from your deal context. Describe your prospect, audience, and goal — get a polished, branded asset ready to share with customers.",
      "path": "skills/create-an-asset"
    },
    {
      "name": "daily-briefing",
      "namespace": null,
      "description": "Start your day with a prioritized sales briefing. Works standalone when you tell me your meetings and priorities, supercharged when you connect your calendar, CRM, and email. Trigger with \"morning briefing\", \"daily brief\", \"what's on my plate today\", \"prep my day\", or \"start my day\".",
      "path": "skills/daily-briefing"
    },
    {
      "name": "draft-outreach",
      "namespace": null,
      "description": "Research a prospect then draft personalized outreach. Uses web research by default, supercharged with enrichment and CRM. Trigger with \"draft outreach to [person/company]\", \"write cold email to [prospect]\", \"reach out to [name]\".",
      "path": "skills/draft-outreach"
    },
    {
      "name": "forecast",
      "namespace": null,
      "description": "Generate a weighted sales forecast with best/likely/worst scenarios, commit vs. upside breakdown, and gap analysis. Use when preparing a quarterly forecast call, assessing gap-to-quota from a pipeline CSV, deciding which deals to commit vs. call upside, or checking pipeline coverage against your number.",
      "path": "skills/forecast"
    },
    {
      "name": "pipeline-review",
      "namespace": null,
      "description": "Analyze pipeline health — prioritize deals, flag risks, get a weekly action plan. Use when running a weekly pipeline review, deciding which deals to focus on this week, spotting stale or stuck opportunities, auditing for hygiene issues like bad close dates, or identifying single-threaded deals.",
      "path": "skills/pipeline-review"
    }
  ]
} as const satisfies KnownTap;
