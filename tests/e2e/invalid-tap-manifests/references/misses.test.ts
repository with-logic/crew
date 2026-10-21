/** Final bare and qualified misses retain invalid directory diagnostics (§8.3). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";
import { pathTap, referenceFixture, rejectedLayout } from "./helpers.ts";

const original = {
  userPath: claudeCodeAdapter.userPath,
  projectPath: claudeCodeAdapter.projectPath,
  detect: claudeCodeAdapter.detect,
};
beforeEach(() => {
  const root = makeTempDir("crew-miss-agent-");
  claudeCodeAdapter.userPath = () => root;
  claudeCodeAdapter.projectPath = (cwd) => join(cwd, ".claude", "skills");
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const json of [false, true]) {
  test(`C-TAP-08e bare miss reports rejected locations with original error shape (${json})`, () => {
    const f = referenceFixture();
    const rejected = rejectedLayout(f.root);
    const result = f.invoke("ghost", json ? ["--json"] : []);
    expect(result.code).toBe(4);
    const message = json ? JSON.parse(result.out).error.message : result.err;
    expect(message).toContain("`ghost` was not found in any configured tap.");
    for (const path of Object.values(rejected)) expect(message).toContain(path);
    expect(message).toContain("invalid_skill");
    expect(message).toContain("`name` has invalid characters");
    expect(message).toContain("isn't valid YAML");
    expect(message).toContain("must not be a symbolic link");
    if (json) {
      expect(result.err).toBe("");
      expect(Object.keys(JSON.parse(result.out))).toEqual(["error"]);
      expect(Object.keys(JSON.parse(result.out).error)).toEqual(["name", "message", "details"]);
      expect(JSON.parse(result.out).error.name).toBe("invalid_ref");
      expect(JSON.parse(result.out).error.details).toEqual({ name: "ghost" });
    } else {
      expect(result.out).toBe("");
      expect(message).toContain("Searched: local.");
    }
  });
}

test("C-TAP-08e explicit skill and info non-tap misses retain their original context", () => {
  const f = referenceFixture();
  const { bad } = rejectedLayout(f.root);
  for (const command of ["install", "info"]) {
    const result = f.invoke(
      "ghost",
      command === "install" ? ["--skill", "--json"] : ["--json"],
      command,
    );
    expect(result.code).toBe(4);
    const error = JSON.parse(result.out).error;
    expect(error.name).toBe("invalid_ref");
    expect(error.message).toContain(bad);
    expect(error.message).toContain("invalid_skill");
    expect(error.details).toEqual(
      command === "install" ? { name: "ghost", kind: "skill" } : { name: "ghost" },
    );
  }
});

test("C-TAP-08e bundle misses include only matching rejected namespace; tap misses stay exact", () => {
  const f = referenceFixture();
  const { bad, malformed, other } = rejectedLayout(f.root);
  const result = f.invoke("marketing", ["--bundle", "--json"]);
  const error = JSON.parse(result.out).error;
  expect(result.code).toBe(4);
  expect(error.name).toBe("invalid_ref");
  expect(error.details).toEqual({ name: "marketing", kind: "namespace" });
  expect(error.message).toContain(malformed);
  expect(error.message).not.toContain(bad);
  expect(error.message).not.toContain(other);
  const tap = f.invoke("ghost", ["--tap", "--json"]);
  expect(JSON.parse(tap.out).error).toEqual({
    name: "invalid_ref",
    message: "`ghost` is not a tap; rerun without `--tap` or pick a different value",
    details: { name: "ghost", kind: "tap" },
  });
});

test("C-TAP-08e rejected metadata never becomes a candidate or changes healthy ambiguity", () => {
  const f = referenceFixture();
  const { bad } = rejectedLayout(f.root);
  const miss = f.invoke("bad", ["--json"]);
  expect(JSON.parse(miss.out).error.name).toBe("invalid_ref");
  expect(JSON.parse(miss.out).error.message).toContain(bad);
  for (const ref of ["healthy", "local/healthy"]) {
    const result = f.invoke(ref, ["--dry-run", "--agent", "claude-code", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out).records.map((r: { name: string }) => r.name)).toEqual([
      "healthy",
    ]);
    expect(result.out).not.toContain("BAD_NAME");
    expect(result.err).toBe("");
  }
  const second = makeTempDir("crew-miss-second-");
  makeSkill(second, "healthy", skillFrontmatter({ name: "healthy" }));
  f.configure([pathTap(f.root), pathTap(second, "second")]);
  const ambiguous = f.invoke("healthy", ["--json", "--yes"]);
  expect(JSON.parse(ambiguous.out).error.name).toBe("ambiguous_reference");
  expect(JSON.parse(ambiguous.out).error.details.candidates).toHaveLength(2);
  expect(ambiguous.out).not.toContain(bad);
});
