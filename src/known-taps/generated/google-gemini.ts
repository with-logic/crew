/**
 * Generated known-tap registry data for google-gemini (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const GOOGLE_GEMINI_KNOWN_TAP = {
  "name": "google-gemini",
  "url": "https://github.com/google-gemini/gemini-skills.git",
  "subpath": "skills",
  "description": "Google Gemini skills for Gemini API, Gemini Live API, and model interaction workflows.",
  "trust": "official",
  "skills": [
    {
      "name": "gemini-api-dev",
      "namespace": null,
      "description": "Use this skill when building applications with Gemini API hosted models, including Gemini and Gemma 4, working with multimodal content (text, images, audio, video), implementing function calling, using structured outputs, or needing current model specifications. Covers SDK usage (google-genai for Python, @google/genai for JavaScript/TypeScript, com.google.genai:google-genai for Java, google.golang.org/genai for Go), model selection, and API capabilities.",
      "path": "gemini-api-dev"
    },
    {
      "name": "gemini-interactions-api",
      "namespace": null,
      "description": "Use this skill when writing code that calls the Gemini API for text generation, multi-turn chat, multimodal understanding, image generation, streaming responses, background research tasks, function calling, structured output, or migrating from the old generateContent API. This skill covers the Interactions API, the recommended way to use Gemini models and agents in Python and TypeScript.",
      "path": "gemini-interactions-api"
    },
    {
      "name": "gemini-live-api-dev",
      "namespace": null,
      "description": "Use this skill when building real-time, bidirectional streaming applications with the Gemini Live API. Covers WebSocket-based audio/video/text streaming, voice activity detection (VAD), native audio features, function calling, session management, ephemeral tokens for client-side auth, and all Live API configuration options. SDKs covered - google-genai (Python), @google/genai (JavaScript/TypeScript).",
      "path": "gemini-live-api-dev"
    }
  ]
} as const satisfies KnownTap;
