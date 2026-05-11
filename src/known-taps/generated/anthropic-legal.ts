/**
 * Generated known-tap registry data for anthropic-legal (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_LEGAL_KNOWN_TAP = {
  "name": "anthropic-legal",
  "url": "https://github.com/anthropics/knowledge-work-plugins.git",
  "subpath": "legal",
  "description": "Anthropic knowledge-work skills for contract review, NDA triage, legal risk, compliance, and vendor checks.",
  "trust": "official",
  "skills": [
    {
      "name": "brief",
      "namespace": null,
      "description": "Generate contextual briefings for legal work — daily summary, topic research, or incident response. Use when starting your day and need a scan of legal-relevant items across email, calendar, and contracts, when researching a specific legal question across internal sources, or when a developing situation (data breach, litigation threat, regulatory inquiry) needs rapid context.",
      "path": "skills/brief"
    },
    {
      "name": "compliance-check",
      "namespace": null,
      "description": "Run a compliance check on a proposed action, product feature, or business initiative, surfacing applicable regulations, required approvals, and risk areas. Use when launching a feature that touches personal data, when marketing or product proposes something with regulatory implications, or when you need to know which approvals and jurisdictional requirements apply before proceeding.",
      "path": "skills/compliance-check"
    },
    {
      "name": "legal-response",
      "namespace": null,
      "description": "Generate a response to a common legal inquiry using configured templates, with built-in escalation checks for situations that shouldn't use a templated reply. Use when responding to data subject requests, litigation hold notices, vendor legal questions, NDA requests from business teams, or subpoenas.",
      "path": "skills/legal-response"
    },
    {
      "name": "legal-risk-assessment",
      "namespace": null,
      "description": "Assess and classify legal risks using a severity-by-likelihood framework with escalation criteria. Use when evaluating contract risk, assessing deal exposure, classifying issues by severity, or determining whether a matter needs senior counsel or outside legal review.",
      "path": "skills/legal-risk-assessment"
    },
    {
      "name": "meeting-briefing",
      "namespace": null,
      "description": "Prepare structured briefings for meetings with legal relevance and track resulting action items. Use when preparing for contract negotiations, board meetings, compliance reviews, or any meeting where legal context, background research, or action tracking is needed.",
      "path": "skills/meeting-briefing"
    },
    {
      "name": "review-contract",
      "namespace": null,
      "description": "Review a contract against your organization's negotiation playbook — flag deviations, generate redlines, provide business impact analysis. Use when reviewing vendor or customer agreements, when you need clause-by-clause analysis against standard positions, or when preparing a negotiation strategy with prioritized redlines and fallback positions.",
      "path": "skills/review-contract"
    },
    {
      "name": "signature-request",
      "namespace": null,
      "description": "Prepare and route a document for e-signature — run a pre-signature checklist, configure signing order, and send for execution. Use when a contract is finalized and ready to sign, when verifying entity names, exhibits, and signature blocks before sending, or when setting up an envelope with sequential or parallel signers.",
      "path": "skills/signature-request"
    },
    {
      "name": "triage-nda",
      "namespace": null,
      "description": "Rapidly triage an incoming NDA and classify it as GREEN (standard approval), YELLOW (counsel review), or RED (full legal review). Use when a new NDA arrives from sales or business development, when screening for embedded non-solicits, non-competes, or missing carveouts, or when deciding whether an NDA can be signed under standard delegation.",
      "path": "skills/triage-nda"
    },
    {
      "name": "vendor-check",
      "namespace": null,
      "description": "Check the status of existing agreements with a vendor across all connected systems — CLM, CRM, email, and document storage — with gap analysis and upcoming deadlines. Use when onboarding or renewing a vendor, when you need a consolidated view of what's signed and what's missing (MSA, DPA, SOW), or when checking for approaching expirations and surviving obligations.",
      "path": "skills/vendor-check"
    }
  ]
} as const satisfies KnownTap;
