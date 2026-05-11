/**
 * Generated known-tap registry data for anthropic-operations (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_OPERATIONS_KNOWN_TAP = {
  "name": "anthropic-operations",
  "url": "https://github.com/anthropics/knowledge-work-plugins.git",
  "subpath": "operations",
  "description": "Anthropic knowledge-work skills for capacity planning, process docs, runbooks, vendor review, and operational risk.",
  "trust": "official",
  "skills": [
    {
      "name": "capacity-plan",
      "namespace": null,
      "description": "Plan resource capacity — workload analysis and utilization forecasting. Use when heading into quarterly planning, the team feels overallocated and you need the numbers, deciding whether to hire or deprioritize, or stress-testing whether upcoming projects fit the people you have.",
      "path": "skills/capacity-plan"
    },
    {
      "name": "change-request",
      "namespace": null,
      "description": "Create a change management request with impact analysis and rollback plan. Use when proposing a system or process change that needs approval, preparing a change record for CAB review, documenting risk and rollback steps before a deployment, or planning stakeholder communications for a rollout.",
      "path": "skills/change-request"
    },
    {
      "name": "compliance-tracking",
      "namespace": null,
      "description": "Track compliance requirements and audit readiness. Trigger with \"compliance\", \"audit prep\", \"SOC 2\", \"ISO 27001\", \"GDPR\", \"regulatory requirement\", or when the user needs help tracking, preparing for, or documenting compliance activities.",
      "path": "skills/compliance-tracking"
    },
    {
      "name": "process-doc",
      "namespace": null,
      "description": "Document a business process — flowcharts, RACI, and SOPs. Use when formalizing a process that lives in someone's head, building a RACI to clarify who owns what, writing an SOP for a handoff or audit, or capturing the exceptions and edge cases of how work actually gets done.",
      "path": "skills/process-doc"
    },
    {
      "name": "process-optimization",
      "namespace": null,
      "description": "Analyze and improve business processes. Trigger with \"this process is slow\", \"how can we improve\", \"streamline this workflow\", \"too many steps\", \"bottleneck\", or when the user describes an inefficient process they want to fix.",
      "path": "skills/process-optimization"
    },
    {
      "name": "risk-assessment",
      "namespace": null,
      "description": "Identify, assess, and mitigate operational risks. Trigger with \"what are the risks\", \"risk assessment\", \"risk register\", \"what could go wrong\", or when the user is evaluating risks associated with a project, vendor, process, or decision.",
      "path": "skills/risk-assessment"
    },
    {
      "name": "runbook",
      "namespace": null,
      "description": "Create or update an operational runbook for a recurring task or procedure. Use when documenting a task that on-call or ops needs to run repeatably, turning tribal knowledge into exact step-by-step commands, adding troubleshooting and rollback steps to an existing procedure, or writing escalation paths for when things go wrong.",
      "path": "skills/runbook"
    },
    {
      "name": "status-report",
      "namespace": null,
      "description": "Generate a status report with KPIs, risks, and action items. Use when writing a weekly or monthly update for leadership, summarizing project health with green/yellow/red status, surfacing risks and decisions that need stakeholder attention, or turning a pile of project tracker activity into a readable narrative.",
      "path": "skills/status-report"
    },
    {
      "name": "vendor-review",
      "namespace": null,
      "description": "Evaluate a vendor — cost analysis, risk assessment, and recommendation. Use when reviewing a new vendor proposal, deciding whether to renew or replace a contract, comparing two vendors side-by-side, or building a TCO breakdown and negotiation points before procurement sign-off.",
      "path": "skills/vendor-review"
    }
  ]
} as const satisfies KnownTap;
