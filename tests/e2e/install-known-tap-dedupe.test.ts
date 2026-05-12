/**
 * Known-tap install suggestion dedupe tests (§9 / §16.2.1).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { resetKnownTapsForTest, setKnownTapsForTest } from "../../src/known-taps/registry.ts";
import type { KnownTap } from "../../src/known-taps/types.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

const SAME_NAME_TAP: readonly KnownTap[] = [
  {
    name: "openai",
    url: "https://github.com/example/openai-skills.git",
    subpath: "",
    description: "OpenAI workflows.",
    trust: "curated",
    skills: [
      {
        name: "prompt-eval",
        namespace: null,
        description: "Evaluate prompts.",
        path: "prompt-eval",
      },
    ],
  },
  {
    name: "supabase",
    url: "https://github.com/example/supabase-skills.git",
    subpath: "",
    description: "Supabase workflows.",
    trust: "curated",
    skills: [
      {
        name: "supabase",
        namespace: null,
        description: "Work with Supabase projects.",
        path: "supabase",
      },
    ],
  },
];

afterEach(() => {
  resetKnownTapsForTest();
});

describe("known-tap install suggestion dedupe", () => {
  test("C-TAP-24 bare tap and skill name matches prefer the skill suggestion", () => {
    const home = makeCrewHome();
    setKnownTapsForTest(SAME_NAME_TAP);
    const setupStreams = captureStreams();
    runCli(["tap", "remove", "core", "--force"], { home, streams: setupStreams.streams });

    const c = captureStreams();
    const code = runCli(["install", "supabase"], { home, streams: c.streams });

    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew install supabase/supabase");
    expect(c.stderr()).not.toContain("\n  supabase (curated)\n");
  });
});
