/**
 * Generated known-tap registry data for anthropic-hr (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_HR_KNOWN_TAP = {
  "name": "anthropic-hr",
  "url": "https://github.com/anthropics/knowledge-work-plugins.git",
  "subpath": "human-resources",
  "description": "Anthropic knowledge-work skills for recruiting, onboarding, performance review, people reporting, and HR planning.",
  "trust": "official",
  "skills": [
    {
      "name": "comp-analysis",
      "namespace": null,
      "description": "Analyze compensation — benchmarking, band placement, and equity modeling. Trigger with \"what should we pay a [role]\", \"is this offer competitive\", \"model this equity grant\", or when uploading comp data to find outliers and retention risks.",
      "path": "skills/comp-analysis"
    },
    {
      "name": "draft-offer",
      "namespace": null,
      "description": "Draft an offer letter with comp details and terms. Use when a candidate is ready for an offer, assembling a total comp package (base, equity, signing bonus), writing the offer letter text itself, or prepping negotiation guidance for the hiring manager.",
      "path": "skills/draft-offer"
    },
    {
      "name": "interview-prep",
      "namespace": null,
      "description": "Create structured interview plans with competency-based questions and scorecards. Trigger with \"interview plan for\", \"interview questions for\", \"how should we interview\", \"scorecard for\", or when the user is preparing to interview candidates.",
      "path": "skills/interview-prep"
    },
    {
      "name": "onboarding",
      "namespace": null,
      "description": "Generate an onboarding checklist and first-week plan for a new hire. Use when someone has a start date coming up, building the pre-start task list (accounts, equipment, buddy), scheduling Day 1 and Week 1, or setting 30/60/90-day goals for a new team member.",
      "path": "skills/onboarding"
    },
    {
      "name": "org-planning",
      "namespace": null,
      "description": "Headcount planning, org design, and team structure optimization. Trigger with \"org planning\", \"headcount plan\", \"team structure\", \"reorg\", \"who should we hire next\", or when the user is thinking about team size, reporting structure, or organizational design.",
      "path": "skills/org-planning"
    },
    {
      "name": "people-report",
      "namespace": null,
      "description": "Generate headcount, attrition, diversity, or org health reports. Use when pulling a headcount snapshot for leadership, analyzing turnover trends by team, preparing diversity representation metrics, or assessing span of control and flight risk across the org.",
      "path": "skills/people-report"
    },
    {
      "name": "performance-review",
      "namespace": null,
      "description": "Structure a performance review with self-assessment, manager template, and calibration prep. Use when review season kicks off and you need a self-assessment template, writing a manager review for a direct report, prepping rating distributions and promotion cases for calibration, or turning vague feedback into specific behavioral examples.",
      "path": "skills/performance-review"
    },
    {
      "name": "policy-lookup",
      "namespace": null,
      "description": "Find and explain company policies in plain language. Trigger with \"what's our PTO policy\", \"can I work remotely from another country\", \"how do expenses work\", or any plain-language question about benefits, travel, leave, or handbook rules.",
      "path": "skills/policy-lookup"
    },
    {
      "name": "recruiting-pipeline",
      "namespace": null,
      "description": "Track and manage recruiting pipeline stages. Trigger with \"recruiting update\", \"candidate pipeline\", \"how many candidates\", \"hiring status\", or when the user discusses sourcing, screening, interviewing, or extending offers.",
      "path": "skills/recruiting-pipeline"
    }
  ]
} as const satisfies KnownTap;
