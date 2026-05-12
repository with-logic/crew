/**
 * Generated known-tap skill data for compound-engineering (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTapSkill } from "../types.ts";

export const COMPOUND_ENGINEERING_KNOWN_TAP_SKILLS_1 = [
  {
    "name": "ce-agent-native-architecture",
    "namespace": null,
    "description": "Build applications where agents are first-class citizens. Use this skill when designing autonomous agents, creating MCP tools, implementing self-modifying systems, or building apps where features are outcomes achieved by agents operating in a loop.",
    "path": "ce-agent-native-architecture"
  },
  {
    "name": "ce-agent-native-audit",
    "namespace": null,
    "description": "Run comprehensive agent-native architecture review with scored principles",
    "path": "ce-agent-native-audit"
  },
  {
    "name": "ce-brainstorm",
    "namespace": null,
    "description": "Explore requirements and approaches through collaborative dialogue, then write a right-sized requirements document. Use when the user says \"let's brainstorm\", \"what should we build\", or \"help me think through X\", presents a vague or ambitious feature request, or seems unsure about scope or direction -- even without explicitly asking to brainstorm.",
    "path": "ce-brainstorm"
  },
  {
    "name": "ce-clean-gone-branches",
    "namespace": null,
    "description": "Clean up local branches whose remote tracking branch is gone. Use when the user says \"clean up branches\", \"delete gone branches\", \"prune local branches\", \"clean gone\", or wants to remove stale local branches that no longer exist on the remote. Also handles removing associated worktrees for branches that have them.",
    "path": "ce-clean-gone-branches"
  },
  {
    "name": "ce-code-review",
    "namespace": null,
    "description": "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR.",
    "path": "ce-code-review"
  },
  {
    "name": "ce-commit",
    "namespace": null,
    "description": "Create a git commit with a clear, value-communicating message. Use when the user says \"commit\", \"commit this\", \"save my changes\", \"create a commit\", or wants to commit staged or unstaged work. Produces well-structured commit messages that follow repo conventions when they exist, and defaults to conventional commit format otherwise.",
    "path": "ce-commit"
  },
  {
    "name": "ce-commit-push-pr",
    "namespace": null,
    "description": "Commit, push, and open a PR with an adaptive, value-first description that scales in depth with the change. Use when the user says \"commit and PR\", \"ship this\", \"create a PR\", or \"open a pull request\". Also handles description-only flows (\"write a PR description\", \"rewrite the PR body\", \"describe this PR\") without committing or pushing.",
    "path": "ce-commit-push-pr"
  },
  {
    "name": "ce-compound",
    "namespace": null,
    "description": "Document a recently solved problem to compound your team's knowledge",
    "path": "ce-compound"
  },
  {
    "name": "ce-compound-refresh",
    "namespace": null,
    "description": "Refresh stale learning and pattern docs under docs/solutions/ by reviewing them against the current codebase, then updating, consolidating, or deleting drifted ones. Use when the user asks to \"refresh my learnings\", \"audit docs/solutions/\", \"clean up stale learnings\", or \"consolidate overlapping docs\", or when ce-compound flags an older doc as superseded. Do not trigger for general refactor, debugging, or code-review work unless the user has explicitly pointed at docs/solutions/.",
    "path": "ce-compound-refresh"
  },
  {
    "name": "ce-debug",
    "namespace": null,
    "description": "Systematically find root causes and fix bugs. Use when debugging errors, investigating test failures, reproducing bugs from issue trackers (GitHub, Linear, Jira), or when stuck on a problem after failed fix attempts. Also use when the user says 'debug this', 'why is this failing', 'fix this bug', 'trace this error', or pastes stack traces, error messages, or issue references.",
    "path": "ce-debug"
  },
  {
    "name": "ce-demo-reel",
    "namespace": null,
    "description": "Capture a visual demo reel (GIF, terminal recording, screenshots) for PR descriptions. Use when shipping UI changes, CLI features, or any work with observable behavior that benefits from visual proof. Also use when asked to add a demo, record a GIF, screenshot a feature, show what changed visually, create a demo reel, capture evidence, add proof to a PR, or create a before/after comparison.",
    "path": "ce-demo-reel"
  },
  {
    "name": "ce-dhh-rails-style",
    "namespace": null,
    "description": "This skill should be used when writing Ruby and Rails code in DHH's distinctive 37signals style. It applies when writing Ruby code, Rails applications, creating models, controllers, or any Ruby file. Triggers on Ruby/Rails code generation, refactoring requests, code review, or when the user mentions DHH, 37signals, Basecamp, HEY, or Campfire style. Embodies REST purity, fat models, thin controllers, Current attributes, Hotwire patterns, and the \"clarity over cleverness\" philosophy.",
    "path": "ce-dhh-rails-style"
  },
  {
    "name": "ce-doc-review",
    "namespace": null,
    "description": "Review requirements or plan documents using parallel persona agents that surface role-specific issues. Use when a requirements document or plan document exists and the user wants to improve it.",
    "path": "ce-doc-review"
  },
  {
    "name": "ce-frontend-design",
    "namespace": null,
    "description": "Build web interfaces with genuine design quality, not AI slop. Use for any frontend work - landing pages, web apps, dashboards, admin panels, components, interactive experiences. Activates for both greenfield builds and modifications to existing applications. Detects existing design systems and respects them. Covers composition, typography, color, motion, and copy. Verifies results via screenshots before declaring done.",
    "path": "ce-frontend-design"
  },
  {
    "name": "ce-gemini-imagegen",
    "namespace": null,
    "description": "This skill should be used when generating and editing images using the Gemini API (Nano Banana Pro). It applies when creating images from text prompts, editing existing images, applying style transfers, generating logos with text, creating stickers, product mockups, or any image generation/manipulation task. Supports text-to-image, image editing, multi-turn refinement, and composition from multiple reference images.",
    "path": "ce-gemini-imagegen"
  },
  {
    "name": "ce-ideate",
    "namespace": null,
    "description": "Generate and critically evaluate grounded ideas about a topic. Use when asking what to improve, requesting idea generation, exploring surprising directions, or wanting the AI to proactively suggest strong options before brainstorming one in depth. Triggers on phrases like 'what should I improve', 'give me ideas', 'ideate on X', 'surprise me', 'what would you change', or any request for AI-generated suggestions rather than refining the user's own idea.",
    "path": "ce-ideate"
  },
  {
    "name": "ce-optimize",
    "namespace": null,
    "description": "Run metric-driven iterative optimization loops -- define a measurable goal, run parallel experiments, measure each against hard gates or LLM-as-judge scores, keep improvements, and converge on the best solution. Use when optimizing clustering quality, search relevance, build performance, prompt quality, or any measurable outcome that benefits from systematic experimentation.",
    "path": "ce-optimize"
  },
  {
    "name": "ce-plan",
    "namespace": null,
    "description": "Create structured plans for multi-step tasks -- software features, research workflows, events, study plans, or any goal that benefits from breakdown. Also deepens existing plans with interactive sub-agent review. Use when the user says 'plan this', 'create a plan', 'how should we build', 'break this down', or when a brainstorm doc is ready for planning. Use 'deepen the plan' or 'deepening pass' for the deepening flow. For exploratory requests, prefer ce-brainstorm first.",
    "path": "ce-plan"
  },
  {
    "name": "ce-polish-beta",
    "namespace": null,
    "description": "[BETA] Start the dev server, open the feature in a browser, and iterate on improvements together.",
    "path": "ce-polish-beta"
  },
  {
    "name": "ce-product-pulse",
    "namespace": null,
    "description": "Generate a time-windowed pulse report on what users experienced and how the product performed - usage, quality, errors, signals worth investigating. Use when the user says 'run a pulse', 'show me the pulse', 'how are we doing', 'weekly recap', 'launch-day check', or passes a time window like '24h' or '7d'. Configures via .compound-engineering/config.local.yaml and saves reports to docs/pulse-reports/.",
    "path": "ce-product-pulse"
  },
  {
    "name": "ce-proof",
    "namespace": null,
    "description": "Run human-in-the-loop review loops over markdown via Proof (proofeditor.ai) — share, view, comment on, edit, and sync collaborative docs. Use when the user says \"view this in proof\", \"share to proof\", \"HITL this doc\", or wants a shared markdown review surface for a spec, plan, or draft, including handoffs from ce-brainstorm, ce-ideate, or ce-plan. Do not trigger on \"proof\" meaning evidence, math proofs, proof-of-concept, or \"proofread this\".",
    "path": "ce-proof"
  },
  {
    "name": "ce-release-notes",
    "namespace": null,
    "description": "Summarize recent compound-engineering plugin releases, or answer a specific question about a past release with a version citation. Use when the user types `/ce-release-notes` or asks \"what changed in compound-engineering recently?\" or \"what happened to `<skill-name>`?\".",
    "path": "ce-release-notes"
  },
  {
    "name": "ce-report-bug",
    "namespace": null,
    "description": "Report a bug in the compound-engineering plugin",
    "path": "ce-report-bug"
  },
  {
    "name": "ce-resolve-pr-feedback",
    "namespace": null,
    "description": "Resolve PR review feedback by evaluating validity and fixing issues in parallel. Use when addressing PR review comments, resolving review threads, or fixing code review feedback.",
    "path": "ce-resolve-pr-feedback"
  }
] as const satisfies readonly KnownTapSkill[];
