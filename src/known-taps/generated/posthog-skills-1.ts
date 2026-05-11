/**
 * Generated known-tap skill data for posthog (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTapSkill } from "../types.ts";

export const POSTHOG_KNOWN_TAP_SKILLS_1 = [
  {
    "name": "analyzing-experiment-session-replays",
    "namespace": null,
    "description": "Analyze session replay patterns across experiment variants to understand user behavior differences. Use when the user wants to see how users interact with different experiment variants, identify usability issues, compare behavior patterns between control and test groups, or get qualitative insights to complement quantitative experiment results.",
    "path": "analyzing-experiment-session-replays"
  },
  {
    "name": "auditing-experiments-flags",
    "namespace": null,
    "description": "Audit PostHog experiments and feature flags for configuration issues, staleness, and best-practice violations. Read when the user asks to audit, health-check, or review experiments or feature flags, check flag hygiene, or verify experiment setup.",
    "path": "auditing-experiments-flags"
  },
  {
    "name": "auditing-warehouse-data-health",
    "namespace": null,
    "description": "Audit the health of a PostHog project's data warehouse — find every broken or degraded pipeline item across sources, sync schemas, materialized views, batch exports, and transformations. Use when the user asks \"what's broken in my warehouse?\", \"give me a health check\", \"audit my data pipeline\", \"why are some dashboards stale?\", or wants a one-shot triage summary before deciding where to spend time. Produces a prioritized report of issues grouped by severity and type, with recommended next steps.\n",
    "path": "auditing-warehouse-data-health"
  },
  {
    "name": "authoring-log-alerts",
    "namespace": null,
    "description": "Author useful, low-noise log alerts on services in a PostHog project. Use when the user asks to set up alerts for their logs, suggest alerts they should add, or evaluate whether a service is worth monitoring. Covers service triage, baseline characterisation, threshold drafting, back-testing via simulate, and shipping with a notification destination.\n",
    "path": "authoring-log-alerts"
  },
  {
    "name": "cleaning-up-stale-feature-flags",
    "namespace": null,
    "description": "Identify and clean up stale feature flags in a PostHog project. Use when the user wants to find unused, fully rolled out, or abandoned feature flags, review them for safety, and then disable or delete them. Covers staleness detection, dependency checking, and safe removal workflows.",
    "path": "cleaning-up-stale-feature-flags"
  },
  {
    "name": "configuring-experiment-analytics",
    "namespace": null,
    "description": "Configures the analytics side of a PostHog experiment — exposure criteria (default `$feature_flag_called` vs custom exposure events), primary and secondary metrics, the supported metric types (count, sum, ratio with `math` and `math_property`, retention with `retention_window_start` and `start_handling`), multivariate user handling (\"Exclude\" vs \"First seen variant\"), and how to read results once the experiment is live. Use when the user adds or edits a primary or secondary metric (e.g. \"add a secondary metric tracking 'downloaded_file' per user\"), sets up a ratio metric (e.g. \"revenue from purchase_completed / pageviews\"), sets up a retention metric (e.g. \"$pageview → uploaded_file, 7-day window\"), configures custom exposure (e.g. \"only count users who hit /checkout\"), changes multivariate handling, or asks \"who is in the analysis?\", \"how do I measure impact?\", \"is this winning?\", \"what's the confidence level?\", or \"should I ship?\".",
    "path": "configuring-experiment-analytics"
  },
  {
    "name": "configuring-experiment-rollout",
    "namespace": null,
    "description": "Configures the rollout shape of a PostHog experiment — the variant split (50/50, 80/20, A/B/C ratios), the overall rollout percentage that gates how many users enter the experiment, and the disambiguation when a percentage like \"roll out to 25%\" could mean either. Use when the user mentions a rollout percentage, variant split, or traffic distribution; gives a ratio like 60/40, 70/30, or 80/20; asks \"who sees the test variant?\"; wants to increase, decrease, or change the rollout or split on a draft or running experiment; weighs equal vs uneven splits; or proposes a mid-experiment split change (often an anti-pattern that needs reset or end-and-restart).",
    "path": "configuring-experiment-rollout"
  },
  {
    "name": "copying-flags-across-projects",
    "namespace": null,
    "description": "Copy a feature flag from one PostHog project to one or more target projects in the same organization. Use when the user wants to duplicate a flag, promote a flag from staging to production, sync flags across projects, or replicate a flag configuration in a different workspace. Covers cohort remapping, scheduled-change handling, encrypted payloads, and the safe defaults (disabled in target, no scheduled changes).",
    "path": "copying-flags-across-projects"
  },
  {
    "name": "creating-experiments",
    "namespace": null,
    "description": "Guides agents through the 3-step experiment creation flow: defining the hypothesis, configuring rollout, and setting up analytics. Delegates rollout decisions to configuring-experiment-rollout and metric setup to configuring-experiment-analytics.\nTRIGGER when: user asks to create a new experiment or A/B test, OR when you are about to call experiment-create.\nDO NOT TRIGGER when: user is updating an existing experiment, managing lifecycle, or only browsing experiments.",
    "path": "creating-experiments"
  },
  {
    "name": "debugging-local-replay",
    "namespace": null,
    "description": "Debugs why session recordings aren't appearing in the local dev environment. Use when a developer reports that local replay ingestion isn't working, recordings aren't showing up despite /s calls, or the replay pipeline seems broken after hogli start. Covers the full local pipeline: SDK capture, Caddy proxy, capture-replay (Rust), Kafka, ingestion-sessionreplay (Node), recording-api (Node), SeaweedFS, and common failure modes like orphaned processes, stuck phrocs workers, and trigger misconfiguration.\n",
    "path": "debugging-local-replay"
  },
  {
    "name": "diagnosing-failed-warehouse-syncs",
    "namespace": null,
    "description": "Diagnose why a data warehouse sync is failing and recommend the right recovery action. Use when the user asks \"why isn't my Stripe/Postgres/Hubspot sync working?\", \"this table has been stuck for hours\", \"the data in the warehouse looks wrong\", or wants to troubleshoot a specific source or schema. Covers source-level vs schema-level failures, stuck Running states, credential and schema-drift errors, incremental-field misconfig, CDC prerequisite failures, and the cancel / reload / resync / delete-data recovery actions.\n",
    "path": "diagnosing-failed-warehouse-syncs"
  },
  {
    "name": "diagnosing-missing-recordings",
    "namespace": null,
    "description": "Diagnoses why a session recording is missing or was not captured. Use when a user asks why a session has no replay, why recordings aren't appearing, or wants to troubleshoot session replay capture issues for a specific session ID or across their project. Covers SDK diagnostic signals, project settings, sampling, triggers, ad blockers, and quota/billing scenarios.\n",
    "path": "diagnosing-missing-recordings"
  },
  {
    "name": "diagnosing-sdk-health",
    "namespace": null,
    "description": "Diagnoses the health of a project's PostHog SDK integrations — which SDKs are up to date, which are outdated, and what to do about it. Use when a user asks about PostHog SDK versions, outdated SDKs, upgrade recommendations, \"SDK health\", \"SDK doctor\", or when events or features seem off and it might be due to using an old SDK.\n",
    "path": "diagnosing-sdk-health"
  },
  {
    "name": "exploring-apm-traces",
    "namespace": null,
    "description": "Investigates distributed application performance using PostHog APM (OpenTelemetry span) data via MCP. Use when the user asks about service traces, slow HTTP/database spans, error spans, trace IDs, or span attributes — not LLM analytics traces or product logs. Uses posthog:query-apm-spans, posthog:apm-trace-get, posthog:apm-services-list, posthog:apm-attributes-list, and posthog:apm-attribute-values-list.\n",
    "path": "exploring-apm-traces"
  },
  {
    "name": "exploring-autocapture-events",
    "namespace": null,
    "description": "Guides exploration of $autocapture events captured by posthog-js to understand user interactions, find CSS selectors (especially data-attr attributes), evaluate selector uniqueness, query matching clicks ad-hoc, and create actions. Use when the user asks about autocapture data, wants to find what users are clicking, needs to build actions from click events, asks about elements_chain, wants to build a trend or funnel filtered by clicks or other autocapture interactions, asks which properties autocapture sends, or asks how to filter $autocapture events. Only applies to projects using posthog-js autocapture.\n",
    "path": "exploring-autocapture-events"
  },
  {
    "name": "exploring-live-traffic",
    "namespace": null,
    "description": "Inspects PostHog Web analytics Live tab data — current users online, last-30-minutes pageviews, top pages, referrers, devices, browsers, countries, bot traffic, and the per-minute bot/users charts. Use when the user asks \"who is on my site right now?\", \"what is happening live?\", \"what bots are crawling me?\", asks about the \"live tab\" / \"live dashboard\", wants live numbers (last 30 min), or wants help filtering or drilling into the live view. Also covers building product-analytics insights that mirror what the tiles show.",
    "path": "exploring-live-traffic"
  },
  {
    "name": "exploring-llm-clusters",
    "namespace": null,
    "description": "Investigate LLM analytics clusters — understand usage patterns in AI/LLM traffic, compare cluster behavior, compute cost/latency metrics, and drill into individual traces within clusters.",
    "path": "exploring-llm-clusters"
  },
  {
    "name": "exploring-llm-costs",
    "namespace": null,
    "description": "Investigate LLM spend in PostHog — total cost over time, cost by model, provider, user, trace, or custom dimension, token and cache-hit economics, and cost regressions. Use when the user asks \"how much are we spending on LLMs?\", \"which model / user / feature is most expensive?\", \"why did cost spike?\", wants to build a cost dashboard or alert, or pastes a trace URL and asks about its cost.\n",
    "path": "exploring-llm-costs"
  },
  {
    "name": "exploring-llm-evaluations",
    "namespace": null,
    "description": "Investigate LLM analytics evaluations of both types — `hog` (deterministic code-based) and `llm_judge` (LLM-prompt-based). Find existing evaluations, inspect their configuration, run them against specific generations, query individual pass/fail results, and generate AI-powered summaries of patterns across many runs. Use when the user asks to debug why an evaluation is failing, surface common failure modes, compare results across filters, dry-run a Hog evaluator, prototype a new LLM-judge prompt, or manage the evaluation lifecycle (create, update, enable/disable, delete).\n",
    "path": "exploring-llm-evaluations"
  },
  {
    "name": "exploring-llm-traces",
    "namespace": null,
    "description": "ABSOLUTE MUST to debug and inspect LLM/AI agent traces using PostHog's MCP tools. Use when the user pastes a trace or session URL (e.g. /llm-analytics/traces/<id> or /llm-analytics/sessions/<id>), asks to debug a trace, figure out what went wrong, check if an agent used a tool correctly, verify context/files were surfaced, inspect subagent behavior, investigate LLM decisions, or analyze token usage and costs.\n",
    "path": "exploring-llm-traces"
  },
  {
    "name": "feature-usage-feed",
    "namespace": null,
    "description": "Set up an LLM-judge evaluation that extracts canonical use cases for a PostHog feature at scale and streams the results to a Slack channel as a live feed. Use when someone wants to understand how users are actually using a specific AI/LLM-powered feature in production — what they're investigating, what questions they're trying to answer, and what patterns surface — without manually reading hundreds of traces. Assumes the feature emits `$ai_generation` and `$ai_evaluation` events with `$session_id` linkage to the trigger user's recording (the standard setup post the session-summary linkage PRs).\n",
    "path": "feature-usage-feed"
  },
  {
    "name": "finding-experiments",
    "namespace": null,
    "description": "Resolves a PostHog experiment reference from natural language to a concrete experiment ID by browsing `experiment-list` (not feature-flag tools), with disambiguation when multiple experiments match. Use when the user names or quotes an experiment (\"split test demo\", \"the File engagement boost experiment\", \"onboarding retention test\", \"landing page hero experiment\", \"pricing experiment\"), describes it loosely (\"the signup experiment\", \"my pricing test\", \"the one with the new checkout\"), uses a relative reference (\"latest\", \"most recent\", \"the one I created yesterday\"), filters by status (running, draft, stopped, archived), or otherwise refers to an experiment by anything other than its concrete ID.",
    "path": "finding-experiments"
  },
  {
    "name": "finding-replay-for-issue",
    "namespace": null,
    "description": "Finds the most informative session recording linked to an error tracking issue. Use when a user has an error tracking issue ID and wants to watch a replay showing what the user was doing when the error occurred. Ranks linked sessions by recency, activity score, and journey completeness, then summarizes the pre-error context. Replaces blind session picking from potentially hundreds of linked recordings.\n",
    "path": "finding-replay-for-issue"
  },
  {
    "name": "inbox-exploration",
    "namespace": null,
    "description": "Explore PostHog's Inbox — the surface where signal reports surface as actionable issues and trends. Use when the user asks \"what's in my inbox?\", \"what should I look at?\", \"which reports are actionable?\", \"what's PostHog flagged recently?\", asks about a specific report by ID or title, or wants to see which signal sources are configured. Covers listing, filtering, and drilling into reports, plus pointers to the deeper `signals` skill when raw signals or semantic search are needed.\n",
    "path": "inbox-exploration"
  }
] as const satisfies readonly KnownTapSkill[];
