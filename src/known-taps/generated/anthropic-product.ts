/**
 * Generated known-tap registry data for anthropic-product (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_PRODUCT_KNOWN_TAP = {
  "name": "anthropic-product",
  "url": "https://github.com/anthropics/knowledge-work-plugins.git",
  "subpath": "product-management",
  "description": "Anthropic knowledge-work skills for product brainstorming, roadmaps, metrics review, sprint planning, and specs.",
  "trust": "official",
  "skills": [
    {
      "name": "competitive-brief",
      "namespace": null,
      "description": "Create a competitive analysis brief for one or more competitors or a feature area. Use when informing product strategy or feature prioritization, building sales battle cards, prepping board or investor materials, or deciding where to differentiate vs. achieve parity.",
      "path": "skills/competitive-brief"
    },
    {
      "name": "metrics-review",
      "namespace": null,
      "description": "Review and analyze product metrics with trend analysis and actionable insights. Use when running a weekly, monthly, or quarterly metrics review, investigating a sudden spike or drop, comparing performance against targets, or turning raw numbers into a scorecard with recommended actions.",
      "path": "skills/metrics-review"
    },
    {
      "name": "product-brainstorming",
      "namespace": null,
      "description": "Brainstorm product ideas, explore problem spaces, and challenge assumptions as a thinking partner. Use when exploring a new opportunity, generating solutions to a product problem, stress-testing an idea, or when a PM needs to think out loud with a sharp sparring partner before converging on a direction.",
      "path": "skills/product-brainstorming"
    },
    {
      "name": "roadmap-update",
      "namespace": null,
      "description": "Update, create, or reprioritize your product roadmap. Use when adding a new initiative and deciding what moves to make room, shifting priorities after new information comes in, moving timelines due to a dependency slip, or building a Now/Next/Later view from scratch.",
      "path": "skills/roadmap-update"
    },
    {
      "name": "sprint-planning",
      "namespace": null,
      "description": "Plan a sprint — scope work, estimate capacity, set goals, and draft a sprint plan. Use when kicking off a new sprint, sizing a backlog against team availability (accounting for PTO and meetings), deciding what's P0 vs. stretch, or handling carryover from the last sprint.",
      "path": "skills/sprint-planning"
    },
    {
      "name": "stakeholder-update",
      "namespace": null,
      "description": "Generate a stakeholder update tailored to audience and cadence. Use when writing a weekly or monthly status for leadership, announcing a launch, escalating a risk or blocker, or translating the same progress into exec-brief, engineering-detail, or customer-facing versions.",
      "path": "skills/stakeholder-update"
    },
    {
      "name": "synthesize-research",
      "namespace": null,
      "description": "Synthesize user research from interviews, surveys, and feedback into structured insights. Use when you have a pile of interview notes, survey responses, or support tickets to make sense of, need to extract themes and rank findings by frequency and impact, or want to turn raw feedback into roadmap recommendations.",
      "path": "skills/synthesize-research"
    },
    {
      "name": "write-spec",
      "namespace": null,
      "description": "Write a feature spec or PRD from a problem statement or feature idea. Use when turning a vague idea or user request into a structured document, scoping a feature with goals and non-goals, defining success metrics and acceptance criteria, or breaking a big ask into a phased spec.",
      "path": "skills/write-spec"
    }
  ]
} as const satisfies KnownTap;
