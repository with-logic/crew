/**
 * Generated known-tap registry data for anthropic-finance (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_FINANCE_KNOWN_TAP = {
  "name": "anthropic-finance",
  "url": "https://github.com/anthropics/knowledge-work-plugins.git",
  "subpath": "finance",
  "description": "Anthropic knowledge-work skills for finance and accounting workflows including close, reconciliation, reporting, and SOX support.",
  "trust": "official",
  "skills": [
    {
      "name": "audit-support",
      "namespace": null,
      "description": "Support SOX 404 compliance with control testing methodology, sample selection, and documentation standards. Use when generating testing workpapers, selecting audit samples, classifying control deficiencies, or preparing for internal or external audits.",
      "path": "skills/audit-support"
    },
    {
      "name": "close-management",
      "namespace": null,
      "description": "Manage the month-end close process with task sequencing, dependencies, and status tracking. Use when planning the close calendar, tracking close progress, identifying blockers, or sequencing close activities by day.",
      "path": "skills/close-management"
    },
    {
      "name": "financial-statements",
      "namespace": null,
      "description": "Generate financial statements (income statement, balance sheet, cash flow) with period-over-period comparison and variance analysis. Use when preparing a monthly or quarterly P&L, closing the books and need to flag material variances, comparing actuals to budget, building a financial summary for leadership review, or looking up GAAP presentation requirements and period-end adjustments.",
      "path": "skills/financial-statements"
    },
    {
      "name": "journal-entry",
      "namespace": null,
      "description": "Prepare journal entries with proper debits, credits, and supporting detail. Use when booking month-end accruals (AP, payroll, prepaid), recording depreciation or amortization, posting revenue recognition or deferred revenue adjustments, or documenting an entry for audit review.",
      "path": "skills/journal-entry"
    },
    {
      "name": "journal-entry-prep",
      "namespace": null,
      "description": "Prepare journal entries with proper debits, credits, and supporting documentation for month-end close. Use when booking accruals, prepaid amortization, fixed asset depreciation, payroll entries, revenue recognition, or any manual journal entry.",
      "path": "skills/journal-entry-prep"
    },
    {
      "name": "reconciliation",
      "namespace": null,
      "description": "Reconcile accounts by comparing GL balances to subledgers, bank statements, or third-party data. Use when performing bank reconciliations, GL-to-subledger recs, intercompany reconciliations, or identifying and categorizing reconciling items.",
      "path": "skills/reconciliation"
    },
    {
      "name": "sox-testing",
      "namespace": null,
      "description": "Generate SOX sample selections, testing workpapers, and control assessments. Use when planning quarterly or annual SOX 404 testing, pulling a sample for a control (revenue, P2P, ITGC, close), building a testing workpaper template, or evaluating and classifying a control deficiency.",
      "path": "skills/sox-testing"
    },
    {
      "name": "variance-analysis",
      "namespace": null,
      "description": "Decompose financial variances into drivers with narrative explanations and waterfall analysis. Use when analyzing budget vs. actual, period-over-period changes, revenue or expense variances, or preparing variance commentary for leadership.",
      "path": "skills/variance-analysis"
    }
  ]
} as const satisfies KnownTap;
