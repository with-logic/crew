/**
 * Tests for the bundled known-tap registry helpers (§16.2.1).
 */

import { describe, expect, test } from "bun:test";
import { tapConfigFromKnownTap } from "../../src/known-taps/convert.ts";
import { knownTapSource } from "../../src/known-taps/format.ts";
import {
  findKnownTapByName,
  findKnownTapSkill,
  knownTapSkillLabel,
  searchKnownTaps,
} from "../../src/known-taps/search.ts";
import type { KnownTap } from "../../src/known-taps/types.ts";

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
    expect(searchKnownTaps("supa", registry).map((h) => h.skill.name)).toEqual([
      "schema-review",
      "edge-functions",
    ]);
    expect(searchKnownTaps("auth", registry).map((h) => h.skill.name)).toEqual([
      "schema-review",
      "edge-functions",
    ]);
    expect(searchKnownTaps("sql", registry).map((h) => h.skill.name)).toEqual(["schema-review"]);
    expect(searchKnownTaps("database/schema", registry).map((h) => h.skill.name)).toEqual([
      "schema-review",
    ]);
  });

  test("tap name matching is case-insensitive", () => {
    const mixedCaseRegistry: readonly KnownTap[] = [
      {
        name: "OpenAI",
        url: "https://github.com/openai/agent-skills.git",
        subpath: "",
        description: "API workflows",
        trust: "official",
        skills: [
          {
            name: "Prompt-Eval",
            namespace: "Evals",
            description: "Run checks",
            path: "Evals/Prompt-Eval",
          },
        ],
      },
    ];

    expect(searchKnownTaps("openai", mixedCaseRegistry).map((h) => h.skill.name)).toEqual([
      "Prompt-Eval",
    ]);
  });

  test("namespaced skill label matching is case-insensitive", () => {
    const mixedCaseRegistry: readonly KnownTap[] = [
      {
        name: "OpenAI",
        url: "https://github.com/openai/agent-skills.git",
        subpath: "",
        description: "API workflows",
        trust: "official",
        skills: [
          {
            name: "Prompt-Eval",
            namespace: "Evals",
            description: "Run checks",
            path: "Evals/Prompt-Eval",
          },
        ],
      },
    ];

    expect(searchKnownTaps("evals/prompt", mixedCaseRegistry).map((h) => h.skill.name)).toEqual([
      "Prompt-Eval",
    ]);
  });

  test("default registry includes seeded official taps", () => {
    expect(findKnownTapByName("supabase")?.trust).toBe("official");
    expect(searchKnownTaps("supabase").some((hit) => hit.tap.name === "supabase")).toBe(true);
  });
});

describe("known tap source formatting", () => {
  test("knownTapSource renders the simplest valid source reference", () => {
    expect(
      knownTapSource({
        url: "https://github.com/anthropics/skills.git",
        subpath: "skills",
      }),
    ).toBe("https://github.com/anthropics/skills");
    expect(
      knownTapSource({
        url: "https://github.com/anthropics/knowledge-work-plugins.git",
        subpath: "finance",
      }),
    ).toBe("https://github.com/anthropics/knowledge-work-plugins//finance");
    expect(
      knownTapSource({
        url: "git@github.com:anthropics/skills.git",
        subpath: "skills",
      }),
    ).toBe("git@github.com:anthropics/skills.git");
  });
});

describe("known tap lookup", () => {
  test("findKnownTapByName returns null when the registry is empty", () => {
    expect(findKnownTapByName("anything", [])).toBeNull();
  });

  test("findKnownTapByName returns case-insensitive exact matches only", () => {
    expect(findKnownTapByName("openai", registry)?.url).toContain("openai");
    expect(findKnownTapByName("OpenAI", registry)?.url).toContain("openai");
    expect(findKnownTapByName("open", registry)).toBeNull();
  });

  test("findKnownTapSkill uses case-insensitive exact name and namespace", () => {
    const tap = registry[0]!;
    expect(findKnownTapSkill(tap, "Schema-Review", "Database")?.path).toBe(
      "skills/database/schema-review",
    );
    expect(findKnownTapSkill(tap, "schema-review")).toBeNull();
    expect(findKnownTapSkill(tap, "schema", "database")).toBeNull();
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
