/**
 * Generated known-tap registry data for azure (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";
import { AZURE_KNOWN_TAP_SKILLS_1 } from "./azure-skills-1.ts";
import { AZURE_KNOWN_TAP_SKILLS_2 } from "./azure-skills-2.ts";

export const AZURE_KNOWN_TAP = {
  ...{
  "name": "azure",
  "url": "https://github.com/microsoft/azure-skills.git",
  "subpath": "skills",
  "description": "Microsoft Azure skills for cloud planning, deployment, diagnostics, and resource work.",
  "trust": "official"
},
  "skills": [...AZURE_KNOWN_TAP_SKILLS_1, ...AZURE_KNOWN_TAP_SKILLS_2],
} as const satisfies KnownTap;
