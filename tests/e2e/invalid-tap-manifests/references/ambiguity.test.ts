/** Prompt abort keeps valid ambiguity separate from rejected manifests (§8.3). */

import { expect, test } from "bun:test";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";
import { pathTap, referenceFixture, rejectedLayout } from "./helpers.ts";

test("C-TAP-08e prompting with rejected siblings still lists only valid candidates", () => {
  const f = referenceFixture();
  const { bad } = rejectedLayout(f.root);
  const second = makeTempDir("crew-miss-ambiguity-");
  makeSkill(second, "healthy", skillFrontmatter({ name: "healthy" }));
  f.configure([pathTap(f.root), pathTap(second, "second")]);
  const result = f.invoke("healthy", ["--json"]);
  expect(result.code).toBe(4);
  const error = JSON.parse(result.out).error;
  expect(error.name).toBe("ambiguous_reference");
  expect(error.details.candidates).toHaveLength(2);
  expect(error.details.candidates[0]).toContain("crew install local/healthy");
  expect(error.details.candidates[1]).toContain("crew install second/healthy");
  expect(error.message).not.toContain(bad);
});
