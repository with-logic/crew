/**
 * Generated known-tap registry data for anthropic-design (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ANTHROPIC_DESIGN_KNOWN_TAP = {
  "name": "anthropic-design",
  "url": "https://github.com/anthropics/knowledge-work-plugins.git",
  "subpath": "design",
  "description": "Anthropic knowledge-work skills for design critique, accessibility review, UX copy, user research, and design systems.",
  "trust": "official",
  "skills": [
    {
      "name": "accessibility-review",
      "namespace": null,
      "description": "Run a WCAG 2.1 AA accessibility audit on a design or page. Trigger with \"audit accessibility\", \"check a11y\", \"is this accessible?\", or when reviewing a design for color contrast, keyboard navigation, touch target size, or screen reader behavior before handoff.",
      "path": "skills/accessibility-review"
    },
    {
      "name": "design-critique",
      "namespace": null,
      "description": "Get structured design feedback on usability, hierarchy, and consistency. Trigger with \"review this design\", \"critique this mockup\", \"what do you think of this screen?\", or when sharing a Figma link or screenshot for feedback at any stage from exploration to final polish.",
      "path": "skills/design-critique"
    },
    {
      "name": "design-handoff",
      "namespace": null,
      "description": "Generate developer handoff specs from a design. Use when a design is ready for engineering and needs a spec sheet covering layout, design tokens, component props, interaction states, responsive breakpoints, edge cases, and animation details.",
      "path": "skills/design-handoff"
    },
    {
      "name": "design-system",
      "namespace": null,
      "description": "Audit, document, or extend your design system. Use when checking for naming inconsistencies or hardcoded values across components, writing documentation for a component's variants, states, and accessibility notes, or designing a new pattern that fits the existing system.",
      "path": "skills/design-system"
    },
    {
      "name": "research-synthesis",
      "namespace": null,
      "description": "Synthesize user research into themes, insights, and recommendations. Use when you have interview transcripts, survey results, usability test notes, support tickets, or NPS responses that need to be distilled into patterns, user segments, and prioritized next steps.",
      "path": "skills/research-synthesis"
    },
    {
      "name": "user-research",
      "namespace": null,
      "description": "Plan, conduct, and synthesize user research. Trigger with \"user research plan\", \"interview guide\", \"usability test\", \"survey design\", \"research questions\", or when the user needs help with any aspect of understanding their users through research.",
      "path": "skills/user-research"
    },
    {
      "name": "ux-copy",
      "namespace": null,
      "description": "Write or review UX copy — microcopy, error messages, empty states, CTAs. Trigger with \"write copy for\", \"what should this button say?\", \"review this error message\", or when naming a CTA, wording a confirmation dialog, filling an empty state, or writing onboarding text.",
      "path": "skills/ux-copy"
    }
  ]
} as const satisfies KnownTap;
