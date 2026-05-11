/**
 * Generated known-tap registry data for anthropic-fund-admin (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_FUND_ADMIN_KNOWN_TAP = {
  "name": "anthropic-fund-admin",
  "url": "https://github.com/anthropics/financial-services.git",
  "subpath": "plugins/vertical-plugins/fund-admin",
  "description": "Anthropic financial-services skills for fund administration, NAV tie-outs, GL reconciliation, and roll-forward workflows.",
  "trust": "official",
  "skills": [
    {
      "name": "accrual-schedule",
      "namespace": null,
      "description": "Build the period-end accrual schedule — for each accrual, compute the entry, cite the support, and draft the JE. Use during month-end close; the JE is a draft for controller approval, not a posting.",
      "path": "skills/accrual-schedule"
    },
    {
      "name": "break-trace",
      "namespace": null,
      "description": "Root-cause a reconciliation break to its source transaction or posting — follow the audit trail from the break row back to the originating entry on each side and state what differs and why. Use after gl-recon has classified a break.",
      "path": "skills/break-trace"
    },
    {
      "name": "gl-recon",
      "namespace": null,
      "description": "Reconcile general ledger to subledger for a trade date or period — match at the position or transaction level, surface breaks, and classify each break by likely cause. Use for daily or month-end recon runs across asset classes.",
      "path": "skills/gl-recon"
    },
    {
      "name": "nav-tieout",
      "namespace": null,
      "description": "Tie an LP statement to the fund's NAV pack — recompute the LP's capital account from the NAV components and flag any line that doesn't agree. Use before LP statements are distributed.",
      "path": "skills/nav-tieout"
    },
    {
      "name": "roll-forward",
      "namespace": null,
      "description": "Build a roll-forward schedule for a balance-sheet account — beginning balance plus activity less reversals equals ending balance, with each component tied to GL. Use for month-end close packages and audit support.",
      "path": "skills/roll-forward"
    },
    {
      "name": "variance-commentary",
      "namespace": null,
      "description": "Write flux commentary for every P&L and balance-sheet line over threshold — current vs prior period and vs budget, with the driver explained from underlying activity. Use for the month-end close package and management reporting.",
      "path": "skills/variance-commentary"
    }
  ]
} as const satisfies KnownTap;
