/**
 * Generated known-tap registry data for anthropic-engineering (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_ENGINEERING_KNOWN_TAP = {
  "name": "anthropic-engineering",
  "url": "https://github.com/anthropics/knowledge-work-plugins.git",
  "subpath": "engineering",
  "description": "Anthropic knowledge-work skills for architecture, code review, debugging, documentation, incidents, and testing strategy.",
  "trust": "official",
  "skills": [
    {
      "name": "architecture",
      "namespace": null,
      "description": "Create or evaluate an architecture decision record (ADR). Use when choosing between technologies (e.g., Kafka vs SQS), documenting a design decision with trade-offs and consequences, reviewing a system design proposal, or designing a new component from requirements and constraints.",
      "path": "skills/architecture"
    },
    {
      "name": "code-review",
      "namespace": null,
      "description": "Review code changes for security, performance, and correctness. Trigger with a PR URL or diff, \"review this before I merge\", \"is this code safe?\", or when checking a change for N+1 queries, injection risks, missing edge cases, or error handling gaps.",
      "path": "skills/code-review"
    },
    {
      "name": "debug",
      "namespace": null,
      "description": "Structured debugging session — reproduce, isolate, diagnose, and fix. Trigger with an error message or stack trace, \"this works in staging but not prod\", \"something broke after the deploy\", or when behavior diverges from expected and the cause isn't obvious.",
      "path": "skills/debug"
    },
    {
      "name": "deploy-checklist",
      "namespace": null,
      "description": "Pre-deployment verification checklist. Use when about to ship a release, deploying a change with database migrations or feature flags, verifying CI status and approvals before going to production, or documenting rollback triggers ahead of time.",
      "path": "skills/deploy-checklist"
    },
    {
      "name": "documentation",
      "namespace": null,
      "description": "Write and maintain technical documentation. Trigger with \"write docs for\", \"document this\", \"create a README\", \"write a runbook\", \"onboarding guide\", or when the user needs help with any form of technical writing — API docs, architecture docs, or operational runbooks.",
      "path": "skills/documentation"
    },
    {
      "name": "incident-response",
      "namespace": null,
      "description": "Run an incident response workflow — triage, communicate, and write postmortem. Trigger with \"we have an incident\", \"production is down\", an alert that needs severity assessment, a status update mid-incident, or when writing a blameless postmortem after resolution.",
      "path": "skills/incident-response"
    },
    {
      "name": "standup",
      "namespace": null,
      "description": "Generate a standup update from recent activity. Use when preparing for daily standup, summarizing yesterday's commits and PRs and ticket moves, formatting work into yesterday/today/blockers, or structuring a few rough notes into a shareable update.",
      "path": "skills/standup"
    },
    {
      "name": "system-design",
      "namespace": null,
      "description": "Design systems, services, and architectures. Trigger with \"design a system for\", \"how should we architect\", \"system design for\", \"what's the right architecture for\", or when the user needs help with API design, data modeling, or service boundaries.",
      "path": "skills/system-design"
    },
    {
      "name": "tech-debt",
      "namespace": null,
      "description": "Identify, categorize, and prioritize technical debt. Trigger with \"tech debt\", \"technical debt audit\", \"what should we refactor\", \"code health\", or when the user asks about code quality, refactoring priorities, or maintenance backlog.",
      "path": "skills/tech-debt"
    },
    {
      "name": "testing-strategy",
      "namespace": null,
      "description": "Design test strategies and test plans. Trigger with \"how should we test\", \"test strategy for\", \"write tests for\", \"test plan\", \"what tests do we need\", or when the user needs help with testing approaches, coverage, or test architecture.",
      "path": "skills/testing-strategy"
    }
  ]
} as const satisfies KnownTap;
