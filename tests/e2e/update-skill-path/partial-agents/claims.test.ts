/**
 * How crew claims a failed tap child's copy before removing it (§10.1.1
 * step 2; C-UPD-18e): the copy is moved aside while it is checked, so
 * nothing written to its path then is lost — a copy whose path was
 * written to stays where crew set it, named there, and a changed copy
 * crew can't move back is named where it is. Two agents whose skills
 * folders are one folder through a link write one copy, and crew's own
 * second write is no edit: the copy is removed.
 *
 * `--verbose` reports the check as it starts; the test acts then.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import { runCli } from "../../../../src/cli/main.ts";
import { isTapErrorRow, type TapReexpandRow } from "../../../../src/install/tap-reexpand/types.ts";
import { readState } from "../../../../src/state/load.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";
import { run } from "../helpers.ts";
import { installTrackedTap, redirectAgents, whileReadOnly } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

/**
 * `crew update --json --verbose` with new child `gamma` failing in
 * gemini-cli's read-only folder; `whileChecked` runs as crew checks
 * claude-code's copy before removing it. The exit code, the child's
 * error, whether state recorded it, and claude-code's copy.
 */
function updateFailingChild(home: string, whileChecked: (copy: string) => void = () => {}) {
  const copy = join(agents.roots["claude-code"], "gamma");
  let stdout = "";
  const streams = {
    stdout: (s: string) => {
      stdout += s;
    },
    stderr: (s: string) => {
      if (s.includes(`checking ${copy} before removing it`)) whileChecked(copy);
    },
  };
  const code = whileReadOnly(agents.roots["gemini-cli"], () =>
    runCli(["update", "--json", "--verbose"], { home, streams }),
  );
  const rows = JSON.parse(stdout).tap_reexpand_rows as readonly TapReexpandRow[];
  const recorded = readState(home).installations.some((e) => e.name === "gamma");
  return { code, error: rows.filter(isTapErrorRow)[0]!.error, recorded, copy };
}

/** Add child `gamma` to `tapDir` upstream. */
function addGamma(tapDir: string): void {
  makeSkill(join(tapDir, "skills"), "gamma", skillFrontmatter({ name: "gamma" }));
}

/** Where crew set claude-code's copy aside, while it is aside. */
function setAside(): string[] {
  const root = agents.roots["claude-code"];
  return readdirSync(root)
    .filter((n) => n.startsWith(".crew-removing-gamma-"))
    .map((n) => join(root, n));
}

test("C-UPD-18e a copy is set aside while it is checked; what is written to its path then stays", () => {
  const home = makeCrewHome();
  addGamma(installTrackedTap(home));
  let presentWhileChecked: boolean | undefined;
  const r = updateFailingChild(home, (copy) => {
    presentWhileChecked = existsSync(copy);
    mkdirSync(copy);
    writeFileSync(join(copy, "SKILL.md"), "Mine.\n");
  });
  expect(presentWhileChecked).toBe(false);
  expect([r.code, r.error.code, r.recorded]).toEqual([1, "EACCES", false]);
  expect(readFileSync(join(r.copy, "SKILL.md"), "utf8")).toBe("Mine.\n");
  const [aside] = setAside();
  expect(r.error.message).toContain(
    `left in place: \`${aside}\` (set aside to be removed, while something was written to its path)`,
  );
});

test("C-UPD-18e a changed copy that can't go back to its path is named where crew set it", () => {
  const home = makeCrewHome();
  addGamma(installTrackedTap(home));
  const root = agents.roots["claude-code"];
  let r: ReturnType<typeof updateFailingChild>;
  try {
    r = updateFailingChild(home, () => {
      appendFileSync(join(setAside()[0]!, "SKILL.md"), "Mine.\n");
      chmodSync(root, 0o555);
    });
  } finally {
    chmodSync(root, 0o755);
  }
  const [aside] = setAside();
  expect([r.code, r.error.code, r.recorded]).toEqual([1, "EACCES", false]);
  expect(r.error.message).toContain(`left in place: \`${aside}\` (crew can't confirm`);
  expect(readFileSync(join(aside!, "SKILL.md"), "utf8")).toEndWith("Mine.\n");
});

test("C-UPD-18e two agents whose folders are one folder through a link write one copy, removed", () => {
  const home = makeCrewHome();
  // codex's skills folder is claude-code's, through a link.
  const linked = join(makeTempDir("crew-codex-"), "skills");
  mkdirSync(dirname(linked), { recursive: true });
  symlinkSync(agents.roots["claude-code"], linked);
  const saved = { userPath: codexAdapter.userPath, detect: codexAdapter.detect };
  codexAdapter.userPath = () => linked;
  codexAdapter.detect = () => true;
  try {
    const tapDir = makeTempDir();
    makeSkill(join(tapDir, "skills"), "beta", skillFrontmatter({ name: "beta" }));
    expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
    expect(run(home, ["install", "mine"]).code).toBe(0);
    addGamma(tapDir);
    const r = updateFailingChild(home);
    expect([r.code, r.error.code, r.recorded]).toEqual([1, "EACCES", false]);
    expect(r.error.message).not.toContain("left in place");
    expect(readdirSync(agents.roots["claude-code"])).toEqual(["beta"]);
  } finally {
    Object.assign(codexAdapter, saved);
  }
});
