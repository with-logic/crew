/**
 * Generated known-tap registry data for anthropic-financial-operations (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_FINANCIAL_OPERATIONS_KNOWN_TAP = {
  "name": "anthropic-financial-operations",
  "url": "https://github.com/anthropics/financial-services.git",
  "subpath": "plugins/vertical-plugins/operations",
  "description": "Anthropic financial-services skills for KYC document parsing and operational screening workflows.",
  "trust": "official",
  "skills": [
    {
      "name": "kyc-doc-parse",
      "namespace": null,
      "description": "Parse an investor or client onboarding packet into structured KYC fields — identity, ownership, control, source of funds, and document inventory. Use as the first step of KYC screening; output feeds the rules engine.",
      "path": "skills/kyc-doc-parse"
    },
    {
      "name": "kyc-rules",
      "namespace": null,
      "description": "Apply the firm's KYC/AML rules grid to a parsed onboarding record — assign a risk rating, list every rule outcome with the rule cited, and flag what's missing or escalation-worthy. Use after kyc-doc-parse; this skill decides nothing, it scores and routes.",
      "path": "skills/kyc-rules"
    }
  ]
} as const satisfies KnownTap;
