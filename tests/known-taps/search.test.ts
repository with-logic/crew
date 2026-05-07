/**
 * Tests for the bundled known-tap registry helpers (§16.2.1).
 */

import { describe, expect, test } from "bun:test";
import {
  findKnownTapByName,
  findKnownTapSkill,
  knownTapSkillLabel,
  searchKnownTaps,
} from "../../src/known-taps/search.ts";
import { type KnownTap, tapConfigFromKnownTap } from "../../src/known-taps/types.ts";

const registry: readonly KnownTap[] = [
  {
    name: "supabase",
    url: "https://github.com/supabase/agent-skills.git",
    subpath: "skills",
    description: "Database and auth workflows",
    trust: "official",
    skills: [
      {
        name: "schema-review",
        namespace: "database",
        description: "Review SQL migrations",
        path: "skills/database/schema-review",
      },
      {
        name: "edge-functions",
        namespace: null,
        description: "Deploy edge code",
        path: "skills/edge-functions",
      },
    ],
  },
  {
    name: "openai",
    url: "https://github.com/openai/agent-skills.git",
    subpath: "",
    description: "Model and API workflows",
    trust: "curated",
    skills: [
      {
        name: "prompt-eval",
        namespace: null,
        description: "Evaluate prompts",
        path: "prompt-eval",
      },
    ],
  },
];

describe("searchKnownTaps", () => {
  test("empty query returns every known skill sorted by tap and label", () => {
    const labels = searchKnownTaps("", registry).map((h) => knownTapSkillLabel(h.skill));
    expect(labels).toEqual(["prompt-eval", "database/schema-review", "edge-functions"]);
  });

  test("query matches tap metadata, skill metadata, and namespaced labels", () => {
    expect(searchKnownTaps("auth", registry).map((h) => h.skill.name)).toEqual([
      "schema-review",
      "edge-functions",
    ]);
    expect(searchKnownTaps("sql", registry).map((h) => h.skill.name)).toEqual(["schema-review"]);
    expect(searchKnownTaps("database/schema", registry).map((h) => h.skill.name)).toEqual([
      "schema-review",
    ]);
  });

  test("default registry is currently empty", () => {
    expect(searchKnownTaps("anything")).toEqual([]);
  });
});

describe("known tap lookup", () => {
  test("findKnownTapByName returns exact matches only", () => {
    expect(findKnownTapByName("openai", registry)?.url).toContain("openai");
    expect(findKnownTapByName("OpenAI", registry)).toBeNull();
  });

  test("findKnownTapSkill respects namespace", () => {
    const tap = registry[0]!;
    expect(findKnownTapSkill(tap, "schema-review", "database")?.path).toBe(
      "skills/database/schema-review",
    );
    expect(findKnownTapSkill(tap, "schema-review")).toBeNull();
  });

  test("tapConfigFromKnownTap creates a registered git tap config", () => {
    expect(tapConfigFromKnownTap(registry[0]!)).toEqual({
      name: "supabase",
      kind: "git",
      registered: true,
      url: "https://github.com/supabase/agent-skills.git",
      subpath: "skills",
      path: "",
    });
  });
});
