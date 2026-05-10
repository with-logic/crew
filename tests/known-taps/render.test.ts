/**
 * Tests for known-tap generated registry rendering (§16.2.1).
 */

import { expect, test } from "bun:test";
import { renderKnownTapRegistry } from "../../src/known-taps/build/render.ts";

test("renderKnownTapRegistry writes generated modules", () => {
  const files = renderKnownTapRegistry([
    {
      name: "alpha",
      url: "https://github.com/example/alpha.git",
      subpath: "skills",
      description: "Alpha skills",
      trust: "official",
      skills: [{ name: "one", namespace: null, description: "One skill", path: "one" }],
    },
  ]);

  expect(files.map((file) => file.path)).toEqual(["alpha.ts", "index.ts"]);
  expect(files[0]?.contents).toContain("export const ALPHA_KNOWN_TAP");
  expect(files[1]?.contents).toContain("GENERATED_KNOWN_TAPS = [ALPHA_KNOWN_TAP]");
});

test("renderKnownTapRegistry splits large tap modules", () => {
  const skills = Array.from({ length: 25 }, (_, i) => ({
    name: `skill-${i}`,
    namespace: null,
    description: `Skill ${i}`,
    path: `skill-${i}`,
  }));

  const files = renderKnownTapRegistry([
    {
      name: "large",
      url: "https://github.com/example/large.git",
      subpath: "skills",
      description: "Large skills",
      trust: "curated",
      skills,
    },
  ]);

  expect(files.map((file) => file.path)).toEqual([
    "large-skills-1.ts",
    "large-skills-2.ts",
    "large.ts",
    "index.ts",
  ]);
  expect(files[2]?.contents).toContain("...LARGE_KNOWN_TAP_SKILLS_1");
  expect(files[2]?.contents).toContain("...LARGE_KNOWN_TAP_SKILLS_2");
});
