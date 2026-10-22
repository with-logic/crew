/** Final-miss diagnostics preserve requested commits and safe output (§8.3, §9, §13). */

import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../../src/config/load.ts";
import { CrewError } from "../../../../src/core/errors.ts";
import { resolveTapRef } from "../../../../src/install/resolve-ref/index.ts";
import { resetKnownTapsForTest, setKnownTapsForTest } from "../../../../src/known-taps/registry.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  tagRepo,
} from "../../../helpers/fixtures.ts";
import { pathTap, referenceFixture, rejectedLayout } from "./helpers.ts";

afterEach(resetKnownTapsForTest);

test("C-TAP-08e known-tap guidance coexists with rejected configured locations", () => {
  const f = referenceFixture();
  const { bad } = rejectedLayout(f.root);
  const configBefore = readFileSync(join(f.home, "config.yaml"), "utf8");
  setKnownTapsForTest([
    {
      name: "catalog",
      url: "file:///crew-miss-absent-known",
      subpath: "",
      description: "Known fixture",
      trust: "curated",
      skills: [
        {
          name: "schema-review",
          namespace: null,
          description: "Review SQL",
          path: "schema-review",
        },
      ],
    },
  ]);
  const result = f.invoke("schema-review", ["--json"]);
  expect(result.code).toBe(4);
  const error = JSON.parse(result.out).error;
  expect(error.name).toBe("invalid_ref");
  expect(error.message).toContain(bad);
  expect(error.message).toContain("Homecrew found possible matches in known taps");
  expect(error.details.name).toBe("schema-review");
  expect(error.details.known_tap_suggestions).toHaveLength(1);
  expect(error.details.known_tap_suggestions[0].install).toBe("crew install catalog/schema-review");
  expect(Object.keys(error.details)).toEqual(["name", "known_tap_suggestions"]);
  expect(readFileSync(join(f.home, "config.yaml"), "utf8")).toBe(configBefore);
});

test("C-TAP-08e rejected diagnostics use the requested Git tree instead of healthy HEAD", () => {
  const f = referenceFixture();
  const repo = makeTempDir("crew-miss-ref-");
  const bad = makeSkill(
    join(repo, "skills", "marketing"),
    "bad",
    "name: OLD_BAD\ndescription: Invalid old name",
  );
  makeGitRepo(repo);
  tagRepo(repo, "v1");
  writeFileSync(join(bad, "SKILL.md"), "---\nname: ghost\ndescription: Healthy at head\n---\n");
  commitAll(repo, "valid head");
  f.configure([
    {
      name: "history",
      kind: "git",
      registered: true,
      path: "",
      url: `file://${repo}`,
      subpath: "",
    },
  ]);
  const old = f.invoke("history/marketing/ghost@v1", ["--json"]);
  expect(old.code).toBe(4);
  const error = JSON.parse(old.out).error;
  expect(error.name).toBe("invalid_ref");
  expect(error.details).toEqual({ tap: "history", namespace: "marketing", name: "ghost" });
  expect(error.message).toContain("`name` has invalid characters");
  expect(error.message).toContain("skills/marketing/bad");
  const current = f.invoke("history/marketing/ghost", ["--json"], "info");
  expect(current.code).toBe(0);
  expect(current.out).toContain("Healthy at head");
  expect(current.out).not.toContain("OLD_BAD");
});

test("C-TAP-08e new diagnostics escape controls and redact values without changing details", () => {
  const f = referenceFixture();
  const bad = makeSkill(f.root, "bad\nforged\x1b", "name: https://private-token@example.com/skill");
  for (const json of [false, true]) {
    const result = f.invoke("ghost", json ? ["--json"] : []);
    expect(result.code).toBe(4);
    const message = json ? JSON.parse(result.out).error.message : result.err;
    expect(message).toContain("bad\\x0aforged\\x1b");
    expect(message).toContain("invalid_skill");
    expect(message).toContain("`name` has invalid characters");
    expect(message).not.toContain("private-token");
    expect(message).not.toContain("\x1b");
    expect(message).not.toContain(bad);
    if (json) expect(JSON.parse(result.out).error.details).toEqual({ name: "ghost" });
  }
});

test("C-TAP-08e invalid gist files stay deliberately ignored on resolution misses", () => {
  const f = referenceFixture();
  writeFileSync(join(f.root, "bad.md"), "---\nname: BAD_GIST\n---\n");
  const gist = {
    ...pathTap(f.root, "gist"),
    kind: "git" as const,
    path: "",
    url: "https://gist.github.com/crew-offline-identity",
  };
  try {
    resolveTapRef(
      { type: "tap", tap: "gist", namespace: null, name: "ghost", ref: null },
      { ...readConfig(f.home), taps: [gist] },
      f.home,
      null,
      { gist: f.root },
    );
    expect.unreachable("expected invalid_ref");
  } catch (error) {
    expect(error).toBeInstanceOf(CrewError);
    const err = error as CrewError;
    expect(err.code).toBe("invalid_ref");
    expect(err.details).toEqual({ first: "gist", second: "ghost" });
    expect(err.message).not.toContain("BAD_GIST");
    expect(err.message).not.toContain("bad.md");
    expect(err.message).not.toContain("Rejected directory manifests");
  }
});
