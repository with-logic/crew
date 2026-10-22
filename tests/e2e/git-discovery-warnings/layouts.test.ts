/** Chosen Git layouts warn once without changing CLI candidates (§9, §9.1, §16.6). */

import { expect, test } from "bun:test";
import { commitAll, makeSkill } from "../../helpers/fixtures.ts";
import { cli, freshHome, register, source, WARNING } from "./fixtures.ts";

for (const layout of ["flat", "skills", "namespace", "recursive", "linked-skills"] as const) {
  test(`C-TAP-08g ${layout} search and source previews report excluded entries once`, () => {
    const { home, reset } = freshHome();
    expect(reset.code).toBe(0);
    const { repo } = source(layout, "healthy", layout !== "linked-skills");
    const registered = register(home, repo, layout);
    expect(registered.code).toBe(0);
    expect(registered.err).toBe("");
    for (const query of ["", "healthy", "unrelated"]) {
      const result = cli(home, ["search", "--tap", "fixture", query, "--json"]);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out).warnings).toEqual([WARNING]);
      expect(result.err).toBe("");
      for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
        expect(`${result.out}${result.err}`).not.toContain(value);
      expect(JSON.parse(result.out).hits.map((hit: { name: string }) => hit.name)).toEqual(
        query === "unrelated" ? [] : ["healthy"],
      );
    }
    const human = cli(home, ["search", "--tap", "fixture"]);
    expect(human.code).toBe(0);
    expect(human.err).toBe(`${WARNING}\n`);
    expect(human.out).not.toContain(WARNING);
    for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
      expect(`${human.out}${human.err}`).not.toContain(value);
    expect(human.out).toContain("healthy");
    const quiet = cli(home, ["search", "--tap", "fixture", "--quiet"]);
    expect(quiet.code).toBe(0);
    expect(quiet.err).toBe(`${WARNING}\n`);
    expect(quiet.out).not.toContain(WARNING);
    for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
      expect(`${quiet.out}${quiet.err}`).not.toContain(value);
    expect(quiet.out).toBe("");

    const reference = layout === "namespace" ? "fixture/group/healthy" : "fixture/healthy";
    for (const ref of ["fixture", reference, `file://${repo}`]) {
      const preview = cli(home, ["info", ref, "--json"]);
      expect(preview.code).toBe(0);
      expect(JSON.parse(preview.out).warnings).toEqual([WARNING]);
      expect(preview.err).toBe("");
      for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
        expect(`${preview.out}${preview.err}`).not.toContain(value);
      expect(JSON.parse(preview.out).skills.map((skill: { name: string }) => skill.name)).toEqual([
        "healthy",
      ]);
    }
    const infoQuiet = cli(home, ["info", "fixture", "--quiet"]);
    expect(infoQuiet.code).toBe(0);
    expect(infoQuiet.err).toBe(`${WARNING}\n`);
    expect(infoQuiet.out).not.toContain(WARNING);
    for (const value of ["excluded-entry", "absent-discovery-target", "another-absent-target"])
      expect(`${infoQuiet.out}${infoQuiet.err}`).not.toContain(value);
  });
}

test("C-TAP-08g search aggregates two affected taps after existing diagnostics", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  for (const [tap, layout] of [
    ["one", "flat"],
    ["two", "skills"],
  ] as const) {
    const { repo, parent } = source(layout);
    if (tap === "one") {
      makeSkill(parent, "invalid", "name: invalid");
      commitAll(repo, "include an invalid directory manifest");
    }
    const registered = register(home, repo, layout, tap);
    expect(registered.code).toBe(0);
    expect(registered.err).toBe("");
  }
  const result = cli(home, ["search", "--json"]);
  expect(result.code).toBe(0);
  expect(result.err).toBe("");
  const payload = JSON.parse(result.out);
  expect(payload.hits.map((hit: { tap: string }) => hit.tap)).toEqual(["one", "two"]);
  expect(payload.warnings).toHaveLength(2);
  expect(payload.warnings[0]).toContain("invalid_skill");
  expect(payload.warnings[1]).toBe(WARNING);
  const human = cli(home, ["search"]);
  expect(human.code).toBe(0);
  expect(human.err.split("\n").filter(Boolean)).toEqual(payload.warnings);
});

test("C-TAP-08g --tap scans only the selected clean tap", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  for (const [tap, links] of [
    ["affected", true],
    ["clean", false],
  ] as const) {
    const { repo } = source("flat", tap, links);
    const registered = register(home, repo, "flat", tap);
    expect(registered.code).toBe(0);
    expect(registered.err).toBe("");
  }
  const result = cli(home, ["search", "--tap", "clean", "--json"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out).warnings).toEqual([]);
  expect(JSON.parse(result.out).hits.map((hit: { name: string }) => hit.name)).toEqual(["clean"]);
  expect(result.err).toBe("");
});
