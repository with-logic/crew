/**
 * Generated known-tap registry data for elevenlabs (§16.2.1).
 *
 * Do not edit by hand. Run `bun run known-taps build` after changing
 * `known-taps/manifest.json`.
 */

import type { KnownTap } from "../types.ts";

export const ELEVENLABS_KNOWN_TAP = {
  "name": "elevenlabs",
  "url": "https://github.com/elevenlabs/skills.git",
  "subpath": "",
  "description": "ElevenLabs skills for text-to-speech, speech-to-text, agents, music, sound effects, and voice workflows.",
  "trust": "official",
  "skills": [
    {
      "name": "agents",
      "namespace": null,
      "description": "Build voice AI agents with ElevenLabs. Use when creating voice assistants, customer service bots, interactive voice characters, or any real-time voice conversation experience.",
      "path": "agents"
    },
    {
      "name": "music",
      "namespace": null,
      "description": "Generate music using ElevenLabs Music API. Use when creating instrumental tracks, songs with lyrics, background music, jingles, or any AI-generated music composition. Supports prompt-based generation, composition plans for granular control, and detailed output with metadata.",
      "path": "music"
    },
    {
      "name": "setup-api-key",
      "namespace": null,
      "description": "Guides users through setting up an ElevenLabs API key for ElevenLabs MCP tools. Use when the user needs to configure an ElevenLabs API key, when ElevenLabs tools fail due to missing API key, or when the user mentions needing access to ElevenLabs. First checks whether ELEVENLABS_API_KEY is already configured and valid, and only runs full setup when needed.",
      "path": "setup-api-key"
    },
    {
      "name": "sound-effects",
      "namespace": null,
      "description": "Generate sound effects from text descriptions using ElevenLabs. Use when creating sound effects, generating audio textures, producing ambient sounds, cinematic impacts, UI sounds, or any audio that isn't speech. Supports looping, duration control, and prompt influence tuning.",
      "path": "sound-effects"
    },
    {
      "name": "speech-to-text",
      "namespace": null,
      "description": "Transcribe audio to text using ElevenLabs Scribe v2. Use when converting audio/video to text, generating subtitles, transcribing meetings, or processing spoken content.",
      "path": "speech-to-text"
    },
    {
      "name": "text-to-speech",
      "namespace": null,
      "description": "Convert text to speech using ElevenLabs voice AI. Use when generating audio from text, creating voiceovers, building voice apps, or synthesizing speech in 70+ languages.",
      "path": "text-to-speech"
    },
    {
      "name": "voice-changer",
      "namespace": null,
      "description": "Transform the voice in an audio recording into a different target voice while preserving emotion, timing, and delivery using the ElevenLabs Voice Changer (speech-to-speech) API. Use when converting one voice to another, changing the speaker/narrator of an existing recording, dubbing a voice-over in a different voice, creating character voices from a scratch performance, anonymizing a speaker, or any \"voice conversion / voice transfer / speech-to-speech\" task. Make sure to use this skill whenever the user mentions voice changing, voice conversion, speech-to-speech, swapping a voice in audio, re-voicing a clip, or applying a different voice to an existing recording — even if they don't explicitly say \"voice changer\".",
      "path": "voice-changer"
    },
    {
      "name": "voice-isolator",
      "namespace": null,
      "description": "Remove background noise and isolate vocals/speech from audio using ElevenLabs Voice Isolator (audio isolation) API. Use when cleaning up noisy recordings, removing music or background ambience from dialogue, isolating speech from field recordings, preparing audio for transcription, extracting vocals, or any \"denoise / clean up / isolate voice\" task.",
      "path": "voice-isolator"
    }
  ]
} as const satisfies KnownTap;
