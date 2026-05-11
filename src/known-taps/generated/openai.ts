/**
 * Generated known-tap registry data for openai (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const OPENAI_KNOWN_TAP = {
  "name": "openai",
  "url": "https://github.com/openai/skills.git",
  "subpath": "skills/.system",
  "description": "OpenAI-maintained system skills for OpenAI docs, image generation, skill creation, and skill installation.",
  "trust": "official",
  "skills": [
    {
      "name": "imagegen",
      "namespace": null,
      "description": "Generate or edit raster images when the task benefits from AI-created bitmap visuals such as photos, illustrations, textures, sprites, mockups, or transparent-background cutouts. Use when Codex should create a brand-new image, transform an existing image, or derive visual variants from references, and the output should be a bitmap asset rather than repo-native code or vector. Do not use when the task is better handled by editing existing SVG/vector/code-native assets, extending an established icon or logo system, or building the visual directly in HTML/CSS/canvas.",
      "path": "imagegen"
    },
    {
      "name": "openai-docs",
      "namespace": null,
      "description": "Use when the user asks how to build with OpenAI products or APIs and needs up-to-date official documentation with citations, help choosing the latest model for a use case, or model upgrade and prompt-upgrade guidance; prioritize OpenAI docs MCP tools, use bundled references only as helper context, and restrict any fallback browsing to official OpenAI domains.",
      "path": "openai-docs"
    },
    {
      "name": "plugin-creator",
      "namespace": null,
      "description": "Create and scaffold plugin directories for Codex with a required `.codex-plugin/plugin.json`, optional plugin folders/files, and baseline placeholders you can edit before publishing or testing. Use when Codex needs to create a new local plugin, add optional plugin structure, or generate or update repo-root `.agents/plugins/marketplace.json` entries for plugin ordering and availability metadata.",
      "path": "plugin-creator"
    },
    {
      "name": "skill-creator",
      "namespace": null,
      "description": "Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations.",
      "path": "skill-creator"
    },
    {
      "name": "skill-installer",
      "namespace": null,
      "description": "Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos).",
      "path": "skill-installer"
    }
  ]
} as const satisfies KnownTap;
