/**
 * Generated known-tap registry data for compound-engineering (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";
import { COMPOUND_ENGINEERING_KNOWN_TAP_SKILLS_1 } from "./compound-engineering-skills-1.ts";
import { COMPOUND_ENGINEERING_KNOWN_TAP_SKILLS_2 } from "./compound-engineering-skills-2.ts";

export const COMPOUND_ENGINEERING_KNOWN_TAP = {
  "name": "compound-engineering",
  "url": "https://github.com/EveryInc/compound-engineering-plugin.git",
  "subpath": "plugins/compound-engineering/skills",
  "description": "EveryInc Compound Engineering skills for spec writing, implementation, review, debugging, and product workflows.",
  "trust": "official",
  "skills": [...COMPOUND_ENGINEERING_KNOWN_TAP_SKILLS_1, ...COMPOUND_ENGINEERING_KNOWN_TAP_SKILLS_2],
} as const satisfies KnownTap;
