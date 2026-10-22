/** Qualified misses limit rejected manifests to the searched interpretation (§8.3). */

import { expect, test } from "bun:test";
import { join } from "node:path";
import { makeSkill, makeTempDir } from "../../../helpers/fixtures.ts";
import { pathTap, referenceFixture, rejectedLayout } from "./helpers.ts";

for (const json of [false, true]) {
  for (const ref of ["marketing/ghost", "local/marketing/ghost"]) {
    test(`C-TAP-08e ${ref} only reports rejected marketing locations (${json})`, () => {
      const f = referenceFixture();
      const { bad, malformed, other, linked } = rejectedLayout(f.root);
      const result = f.invoke(ref, json ? ["--json"] : []);
      expect(result.code).toBe(4);
      const message = json ? JSON.parse(result.out).error.message : result.err;
      expect(message).toContain(malformed);
      for (const path of [bad, other, linked]) expect(message).not.toContain(path);
      expect(message).toContain("isn't valid YAML");
      if (json) {
        const error = JSON.parse(result.out).error;
        expect(error.name).toBe("invalid_ref");
        expect(error.details).toEqual(
          ref.startsWith("local/")
            ? { tap: "local", namespace: "marketing", name: "ghost" }
            : { first: "marketing", second: "ghost" },
        );
      } else if (ref === "marketing/ghost") {
        expect(result.err).toContain("use `@marketing/ghost` instead");
      }
    });
  }
}

test("C-TAP-08e tap miss includes its namespaces plus matching namespace fallback only", () => {
  const f = referenceFixture();
  const rejected = rejectedLayout(f.root);
  const second = makeTempDir("crew-miss-other-");
  const matching = makeSkill(join(second, "skills", "local"), "bad", "name: MATCH_BAD");
  const unrelated = makeSkill(join(second, "skills", "unrelated"), "bad", "name: UNRELATED_BAD");
  f.configure([pathTap(f.root), pathTap(second, "second")]);
  const result = f.invoke("local/ghost", ["--json"]);
  expect(result.code).toBe(4);
  const error = JSON.parse(result.out).error;
  expect(error.name).toBe("invalid_ref");
  expect(error.details).toEqual({ first: "local", second: "ghost" });
  for (const path of [...Object.values(rejected), matching]) expect(error.message).toContain(path);
  expect(error.message).not.toContain(unrelated);
});

test("C-TAP-08e empty misses preserve original details and repository remedy", () => {
  const f = referenceFixture();
  const result = f.invoke("owner/repo@v1");
  expect(result.code).toBe(4);
  expect(result.err).toContain("`owner/repo@v1` does not match any configured tap or namespace.");
  expect(result.err).toContain("use `@owner/repo@v1` instead");
  expect(result.err).not.toContain("Rejected directory manifests");
  const explicit = f.invoke("missing/marketing/ghost", ["--json"]);
  expect(JSON.parse(explicit.out).error).toEqual({
    name: "invalid_ref",
    message: "`missing` was not found in your list of taps.",
    details: { tap: "missing" },
  });
});
