/**
 * Generated known-tap registry data for figma (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const FIGMA_KNOWN_TAP = {
  "name": "figma",
  "url": "https://github.com/figma/mcp-server-guide.git",
  "subpath": "skills",
  "description": "Figma skills for using the Figma MCP server, implementing designs, generating diagrams, and design-system workflows.",
  "trust": "official",
  "skills": [
    {
      "name": "figma-code-connect",
      "namespace": null,
      "description": "Creates and maintains Figma Code Connect template files that map Figma components to code snippets. Use when the user mentions Code Connect, Figma component mapping, design-to-code translation, or asks to create/update .figma.ts or .figma.js files.",
      "path": "figma-code-connect"
    },
    {
      "name": "figma-create-design-system-rules",
      "namespace": null,
      "description": "Generates custom design system rules for the user's codebase. Use when user says \"create design system rules\", \"generate rules for my project\", \"set up design rules\", \"customize design system guidelines\", or wants to establish project-specific conventions for Figma-to-code workflows. Requires Figma MCP server connection.",
      "path": "figma-create-design-system-rules"
    },
    {
      "name": "figma-create-new-file",
      "namespace": null,
      "description": "Create a new blank Figma file. Use when the user wants to create a new Figma design or FigJam file, or when you need a new file before calling use_figma. Handles plan resolution via whoami if needed. Usage — /figma-create-new-file [editorType] [fileName] (e.g. /figma-create-new-file figjam My Whiteboard)",
      "path": "figma-create-new-file"
    },
    {
      "name": "figma-generate-design",
      "namespace": null,
      "description": "Use this skill alongside figma-use when the task involves translating an application page, view, or multi-section layout into Figma. Triggers: 'write to Figma', 'create in Figma from code', 'push page to Figma', 'take this app/page and build it in Figma', 'create a screen', 'build a landing page in Figma', 'update the Figma screen to match code', 'convert this modal/dialog/drawer/panel to Figma'. This is the preferred workflow skill whenever the user wants to build or update a full page, modal, dialog, drawer, sidebar, panel, or any composed multi-section view in Figma from code or a description. Discovers design system components, variables, and styles from Code Connect files, existing screens, and library search, then imports them and assembles views incrementally section-by-section using design system tokens instead of hardcoded values.",
      "path": "figma-generate-design"
    },
    {
      "name": "figma-generate-diagram",
      "namespace": null,
      "description": "MANDATORY prerequisite — load this skill BEFORE every `generate_diagram` tool call. Routes to type-specific guidance (generic flowchart, architecture flowchart) and tells you when to proceed directly, when to use a different diagram type, or when the tool isn't the right fit at all.",
      "path": "figma-generate-diagram"
    },
    {
      "name": "figma-generate-library",
      "namespace": null,
      "description": "Build or update a professional-grade design system in Figma from a codebase. Use when the user wants to create variables/tokens, build component libraries, set up theming (light/dark modes), document foundations, or reconcile gaps between code and Figma. This skill teaches WHAT to build and in WHAT ORDER — it complements the `figma-use` skill which teaches HOW to call the Plugin API. Both skills should be loaded together.",
      "path": "figma-generate-library"
    },
    {
      "name": "figma-implement-design",
      "namespace": null,
      "description": "Translates Figma designs into production-ready application code with 1:1 visual fidelity. Use when implementing UI code from Figma files, when user mentions \"implement design\", \"generate code\", \"implement component\", provides Figma URLs, or asks to build components matching Figma specs. For Figma canvas writes via `use_figma`, use `figma-use`.",
      "path": "figma-implement-design"
    },
    {
      "name": "figma-use",
      "namespace": null,
      "description": "**MANDATORY prerequisite** — you MUST invoke this skill BEFORE every `use_figma` tool call. NEVER call `use_figma` directly without loading this skill first. Skipping it causes common, hard-to-debug failures. Trigger whenever the user wants to perform a write action or a unique read action that requires JavaScript execution in the Figma file context — e.g. create/edit/delete nodes, set up variables or tokens, build components and variants, modify auto-layout or fills, bind variables to properties, or inspect file structure programmatically.",
      "path": "figma-use"
    },
    {
      "name": "figma-use-figjam",
      "namespace": null,
      "description": "This skill helps agents use Figma's use_figma MCP tool in the FigJam context. Can be used alongside figma-use which has foundational context for using the use_figma tool.",
      "path": "figma-use-figjam"
    }
  ]
} as const satisfies KnownTap;
