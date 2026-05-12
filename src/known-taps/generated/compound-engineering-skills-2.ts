/**
 * Generated known-tap skill data for compound-engineering (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTapSkill } from "../types.ts";

export const COMPOUND_ENGINEERING_KNOWN_TAP_SKILLS_2 = [
  {
    "name": "ce-riffrec-feedback-analysis",
    "namespace": null,
    "description": "Riffrec product-feedback workflow. ALWAYS load when the user posts a `riffrec-*.zip`, a bundle with `session.json` + `events.json` + `recording.webm` + `voice.webm`, a video/audio recording for product feedback, or asks how to capture and share Riffrec sessions. Routes between setup, quick bug report, and extensive analysis.",
    "path": "ce-riffrec-feedback-analysis"
  },
  {
    "name": "ce-sessions",
    "namespace": null,
    "description": "Search and ask questions about coding agent session history across Claude Code, Codex, and Cursor. Use when asking what was worked on, what was tried before, how a problem was investigated across sessions, what happened recently, or any question about past agent sessions. Also use when the user references prior sessions, previous attempts, or past investigations — even without saying 'sessions' explicitly.",
    "path": "ce-sessions"
  },
  {
    "name": "ce-setup",
    "namespace": null,
    "description": "Diagnose and configure compound-engineering environment. Checks CLI dependencies, plugin version, and repo-local config. Offers guided installation for missing tools. Use when troubleshooting missing tools, verifying setup, or before onboarding.",
    "path": "ce-setup"
  },
  {
    "name": "ce-simplify-code",
    "namespace": null,
    "description": "Simplify and refine recently changed code for clarity, reuse, quality, and efficiency while preserving behavior.",
    "path": "ce-simplify-code"
  },
  {
    "name": "ce-slack-research",
    "namespace": null,
    "description": "Search Slack for interpreted organizational context -- decisions, constraints, and discussion arcs -- and produce a synthesized research digest with cross-cutting analysis. Use when the user says 'search slack for', 'what did we discuss about', 'slack context for', or 'what does the team think about'. Differs from slack:find-discussions, which returns raw message results without synthesis.",
    "path": "ce-slack-research"
  },
  {
    "name": "ce-strategy",
    "namespace": null,
    "description": "Create or maintain STRATEGY.md - the product's target problem, approach, users, key metrics, and tracks of work. Use when starting a new product, updating direction, or when prompts like 'write our strategy', 'update the roadmap', 'what are we working on', or 'set up the strategy doc' come up. Also triggers when ce-ideate, ce-brainstorm, or ce-plan need upstream grounding and no strategy doc exists yet.",
    "path": "ce-strategy"
  },
  {
    "name": "ce-test-browser",
    "namespace": null,
    "description": "Run browser tests on pages affected by current PR or branch",
    "path": "ce-test-browser"
  },
  {
    "name": "ce-test-xcode",
    "namespace": null,
    "description": "Build and test iOS apps on simulator using XcodeBuildMCP. Use after making iOS code changes, before creating a PR, or when verifying app behavior and checking for crashes on simulator.",
    "path": "ce-test-xcode"
  },
  {
    "name": "ce-update",
    "namespace": null,
    "description": "Check if the compound-engineering plugin is up to date and recommend the\nupdate command if not. Use when the user says \"update compound engineering\",\n\"check compound engineering version\", \"ce update\", \"is compound engineering\nup to date\", \"update ce plugin\", or reports issues that might stem from a\nstale compound-engineering plugin version. This skill only works in Claude\nCode — it relies on the plugin harness cache layout.\n",
    "path": "ce-update"
  },
  {
    "name": "ce-work",
    "namespace": null,
    "description": "Execute work efficiently while maintaining quality and finishing features",
    "path": "ce-work"
  },
  {
    "name": "ce-work-beta",
    "namespace": null,
    "description": "[BETA] Execute work with external delegate support. Same as ce-work but includes experimental Codex delegation mode for token-conserving code implementation.",
    "path": "ce-work-beta"
  },
  {
    "name": "ce-worktree",
    "namespace": null,
    "description": "Create an isolated git worktree for parallel feature work or PR review. Use when starting work that should not disturb the current checkout, or when `ce-work` or `ce-code-review` offers a worktree option.",
    "path": "ce-worktree"
  },
  {
    "name": "lfg",
    "namespace": null,
    "description": "Run the full autonomous engineering pipeline end-to-end (plan, work, code review, test, commit, push, open PR, watch CI, fix CI failures until green). Use only when the user explicitly requests hands-off execution of a software task and provides a feature description; do not auto-route casual conversation here.",
    "path": "lfg"
  }
] as const satisfies readonly KnownTapSkill[];
