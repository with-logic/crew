/**
 * Generated known-tap registry data for posthog (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";
import { POSTHOG_KNOWN_TAP_SKILLS_1 } from "./posthog-skills-1.ts";
import { POSTHOG_KNOWN_TAP_SKILLS_2 } from "./posthog-skills-2.ts";

export const POSTHOG_KNOWN_TAP = {
  ...{
  "name": "posthog",
  "url": "https://github.com/PostHog/skills.git",
  "subpath": "skills/omnibus",
  "description": "PostHog skills for product analytics, feature flags, experiments, replay, warehouse, logs, LLM analytics, and instrumentation.",
  "trust": "official"
},
  "skills": [...POSTHOG_KNOWN_TAP_SKILLS_1, ...POSTHOG_KNOWN_TAP_SKILLS_2],
} as const satisfies KnownTap;
