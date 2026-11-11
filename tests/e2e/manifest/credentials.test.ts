/**
 * Credentials in a manifest (§9.2): a `.crewrc` line whose URL carries one
 * is refused, because the file is meant to be checked in, and the
 * credential is never printed.
 */

import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { crew, makeProject } from "./helpers.ts";

test("C-RC-09 a line with a credential in its URL is manifest_invalid, and the credential is never printed", () => {
  const home = makeCrewHome();
  const project = makeProject(["https://ghp_secretTOKEN42@host.invalid/acme/skills"]);

  const human = crew(home, project, ["install"]);
  const json = crew(home, project, ["install", "--json"]);

  expect(json.code).toBe(4);
  const { error } = JSON.parse(json.stdout) as {
    error: { name: string; details: { file: string; line: number; ref: string } };
  };
  expect(error.name).toBe("manifest_invalid");
  expect(error.details).toMatchObject({ file: join(project, ".crewrc"), line: 1 });
  expect(error.details.ref).toContain("***");
  expect(human.code).toBe(4);
  expect(human.stderr).toContain("manifest_invalid");
  expect(human.stderr).toContain("credential");
  expect(human.stdout + human.stderr + json.stdout + json.stderr).not.toContain("secretTOKEN42");
  expect(existsSync(join(project, ".crewrc.lock"))).toBe(false);
});
