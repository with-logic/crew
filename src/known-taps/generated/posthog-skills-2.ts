/**
 * Generated known-tap skill data for posthog (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTapSkill } from "../types.ts";

export const POSTHOG_KNOWN_TAP_SKILLS_2 = [
  {
    "name": "instrument-error-tracking",
    "namespace": null,
    "description": "Add PostHog error tracking to capture and monitor exceptions. Use after implementing features or reviewing PRs to ensure errors are tracked with stack traces and source maps. Also handles initial PostHog SDK setup if not yet installed.",
    "path": "instrument-error-tracking"
  },
  {
    "name": "instrument-feature-flags",
    "namespace": null,
    "description": "Add PostHog feature flags to gate new functionality. Use after implementing features or reviewing PRs to ensure safe rollouts with feature flag controls. Also handles initial PostHog SDK setup if not yet installed.",
    "path": "instrument-feature-flags"
  },
  {
    "name": "instrument-integration",
    "namespace": null,
    "description": "Add PostHog SDK integration to your application. Use when setting up PostHog for the first time or reviewing PRs that need PostHog initialization. Covers SDK installation, provider setup, and basic configuration for any framework.",
    "path": "instrument-integration"
  },
  {
    "name": "instrument-llm-analytics",
    "namespace": null,
    "description": "Add PostHog LLM analytics to trace AI model usage. Use after implementing LLM features or reviewing PRs to ensure all generations are captured with token counts, latency, and costs. Also handles initial PostHog SDK setup if not yet installed.",
    "path": "instrument-llm-analytics"
  },
  {
    "name": "instrument-logs",
    "namespace": null,
    "description": "Add PostHog log capture to track application logs. Use after implementing features or reviewing PRs to ensure meaningful log events are captured with structured properties. Also handles initial OTLP exporter setup if not yet configured.",
    "path": "instrument-logs"
  },
  {
    "name": "instrument-product-analytics",
    "namespace": null,
    "description": "Add PostHog product analytics events to track user behavior. Use after implementing new features or reviewing PRs to ensure meaningful user actions are captured. Also handles initial PostHog SDK setup if not yet installed.",
    "path": "instrument-product-analytics"
  },
  {
    "name": "investigate-metric",
    "namespace": null,
    "description": "Diagnose why a product metric changed (dropped, spiked, or plateaued) by orchestrating breakdowns, actors, paths, lifecycle, retention, and annotations queries. Use when the user reports an anomaly, asks \"why did X change?\", or needs root-cause analysis for a trend, funnel, retention, stickiness, or lifecycle metric.\n",
    "path": "investigate-metric"
  },
  {
    "name": "investigating-replay",
    "namespace": null,
    "description": "Investigates a session recording by gathering metadata, person profile, same-session events, and linked error tracking issues in one pass. Use when a user provides a recording or session ID and wants to understand what happened — who the user was, what they did, what errors occurred, and whether there are related error tracking issues. Replaces the manual chain of session-recording-get, persons-retrieve, execute-sql, and query-error-tracking-issues-list.\n",
    "path": "investigating-replay"
  },
  {
    "name": "managing-experiment-lifecycle",
    "namespace": null,
    "description": "Guides experiment state transitions: launching, pausing, resuming, ending, shipping variants, archiving, resetting, and duplicating. Covers preconditions, implications for variant assignment and analysis, and the decision framework for when to use each action.\nTRIGGER when: user asks to launch, pause, resume, end, ship, archive, reset, or duplicate an experiment.\nDO NOT TRIGGER when: user is creating an experiment (use creating-experiments), configuring rollout (use configuring-experiment-rollout), or setting up metrics (use configuring-experiment-analytics).",
    "path": "managing-experiment-lifecycle"
  },
  {
    "name": "managing-subscriptions",
    "namespace": null,
    "description": "Manage PostHog subscriptions — scheduled email, Slack, or webhook deliveries of insight or dashboard snapshots. Use when the user wants to subscribe to an insight or dashboard, check existing subscriptions, change delivery frequency, add or remove recipients, or stop receiving updates.",
    "path": "managing-subscriptions"
  },
  {
    "name": "querying-posthog-data",
    "namespace": null,
    "description": "Required reading before writing any HogQL/SQL or calling execute-sql against PostHog. Use whenever the user wants to search, find, or do complex aggregations PostHog entities (insights, dashboards, cohorts, feature flags, experiments, surveys, hog flows, data warehouse, persons, etc.) and query analytics data (trends, funnels, retention, lifecycle, paths, stickiness, web analytics, error tracking, logs, sessions, LLM traces). Covers HogQL syntax differences from ClickHouse SQL, system table schemas (system.*), available functions, query examples, and the schema-discovery workflow.",
    "path": "querying-posthog-data"
  },
  {
    "name": "setting-up-a-data-warehouse-source",
    "namespace": null,
    "description": "Guide the user through connecting a new data warehouse source — Postgres, MySQL, Stripe, Hubspot, MongoDB, Salesforce, BigQuery, Snowflake, and so on. Use when the user wants to \"connect Stripe\", \"import data from Postgres\", \"add a new data source\", \"sync my warehouse tables\", or wants to pick sync methods for each table. Walks through source-type discovery, credential validation, table discovery, per-table sync_type selection, and the final create call. Also covers picking a good prefix and what to do right after creation.\n",
    "path": "setting-up-a-data-warehouse-source"
  },
  {
    "name": "signals",
    "namespace": null,
    "description": "How to query the document_embeddings table for raw signal data using HogQL. Use when you need to perform semantic search over signals, fetch every signal that contributed to a specific report, or list signal types. For browsing the curated report layer (the Inbox) — listing reports, filtering by status/source, drilling into a single report by ID — use the `inbox-exploration` skill first; drop into this skill afterwards if the user wants the underlying observations.\n",
    "path": "signals"
  },
  {
    "name": "skills-store",
    "namespace": null,
    "description": "Discover and use shared team skills stored in PostHog. Use when the user asks to list, browse, load, or manage \"shared skills\", \"team skills\", or references the \"skills store\" / \"skill store\".",
    "path": "skills-store"
  },
  {
    "name": "suggesting-data-imports",
    "namespace": null,
    "description": "Use when the user asks about revenue, payments, subscriptions, billing, CRM deals, support tickets, production database tables, or other data that PostHog does not collect natively. Also use when a query fails because a table does not exist or returns no results for expected external data. The data warehouse can import from SaaS tools (Stripe, Hubspot, etc.), production databases (Postgres, MySQL, BigQuery, Snowflake), and other arbitrary data sources. Covers checking existing sources, identifying the right source type, and guiding the setup.",
    "path": "suggesting-data-imports"
  },
  {
    "name": "triaging-visual-review-runs",
    "namespace": null,
    "description": "Inspects PostHog Visual Review (VR) runs that gate PR merges with screenshot regression checks. Use when the user mentions \"visual review\", \"VR\", \"snapshot diff\", \"screenshot test\", \"storybook regression\", \"playwright snapshot\", asks why a PR is blocked or what changed visually, wants to triage the VR backlog, decide whether a snapshot diff is real vs flaky, or check whether a story has been changing across runs. Also invoke when a PR has a failing `visual-review` status check, when a PR comment mentions \"Visual review\", or when the user is on a branch with an open VR run.\n",
    "path": "triaging-visual-review-runs"
  },
  {
    "name": "tuning-incremental-sync-config",
    "namespace": null,
    "description": "Change the sync configuration of an existing data warehouse schema — switch sync_type, pick a different incremental_field, set primary_key_columns, choose cdc_table_mode, or change sync_frequency. Use when the user asks \"switch my orders table from full refresh to incremental\", \"this table is syncing too slowly / too frequently\", \"I need to pick a different incremental column\", \"set up CDC for this Postgres table\", or when diagnosis of a failing sync pointed to an incremental-field or PK misconfiguration.\n",
    "path": "tuning-incremental-sync-config"
  },
  {
    "name": "working-with-skills",
    "namespace": null,
    "description": "Best practices for agents managing PostHog skills via the MCP `llma-skill-*` tools — how to discover, read, create, update, and refactor skills efficiently, especially large skills with many bundled files. Use whenever you are about to call any `llma-skill-*` tool, asked to author or edit a shared skill, or troubleshoot why a skill write was rejected. Pairs with `skills-store` (which covers the raw tool surface) by adding the decision-tree, efficiency, and pitfall guidance.",
    "path": "working-with-skills"
  }
] as const satisfies readonly KnownTapSkill[];
