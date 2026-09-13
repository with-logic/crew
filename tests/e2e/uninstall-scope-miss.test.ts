/**
 * `crew uninstall` when the skill isn't installed at the targeted scope
 * (§7.4 "Scope", C-UNINST-15c).
 *
 * The refusal is the product here: `not_installed_here` plus a remedy
 * that names every location the skill DOES live at, and a pasteable
 * command for each. Split from `uninstall-scope.test.ts` for the
 * 200-line cap; both share `helpers/scoped-install.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";
import {
  installSkill,
  locationsOf,
  redirectClaudeCode,
  restoreClaudeCode,
} from "../helpers/scoped-install.ts";

let ccUser: string;
let originals: ReturnType<typeof redirectClaudeCode>["originals"];

beforeEach(() => {
  const redirected = redirectClaudeCode();
  ccUser = redirected.userRoot;
  originals = redirected.originals;
});
afterEach(() => {
  restoreClaudeCode(originals);
});

const scopesOf = (home: string) => locationsOf(home, "demo");

describe("uninstall at a scope where the skill isn't installed", () => {
  test("C-UNINST-15c user-only install + --scope project → not_installed_here with hint", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installSkill(home, "demo", "user", project)).toBe(0);

    const c = captureStreams();
    const code = runCli(["uninstall", "--scope", "project", "demo"], {
      home,
      cwd: project,
      streams: c.streams,
    });
    expect(code).toBe(6);
    expect(c.stderr()).toContain("not_installed_here");
    expect(c.stderr()).toContain("installed at user scope");
    expect(c.stderr()).toContain("drop `--scope project`");
    // Nothing was touched.
    expect(scopesOf(home)).toEqual(["user"]);
    expect(existsSync(join(ccUser, "demo"))).toBe(true);
  });

  test("C-UNINST-15c project-only install + plain uninstall → hint names the project root", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installSkill(home, "demo", "project", project)).toBe(0);

    const c = captureStreams();
    const code = runCli(["uninstall", "--json", "demo"], {
      home,
      cwd: project,
      streams: c.streams,
    });
    expect(code).toBe(6);
    const payload = JSON.parse(c.stdout());
    expect(payload.error.name).toBe("not_installed_here");
    // `installed_locations`, not `installed_at`: that key is an ISO
    // timestamp in the state and marker contracts (§11.1, §7.5).
    expect(payload.error.details.installed_locations).toEqual([
      { scope: "project", project_root: project },
    ]);
    expect(payload.error.details.installed_at).toBeUndefined();

    const human = captureStreams();
    runCli(["uninstall", "demo"], { home, cwd: project, streams: human.streams });
    expect(human.stderr()).toContain(`crew uninstall --scope project demo`);
    expect(scopesOf(home)).toEqual([`project:${project}`]);
  });

  test("C-UNINST-15c --force turns the miss into a no-op", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(installSkill(home, "demo", "user", project)).toBe(0);

    const c = captureStreams();
    const code = runCli(["uninstall", "--force", "--scope", "project", "demo"], {
      home,
      cwd: project,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("nothing to remove");
    expect(scopesOf(home)).toEqual(["user"]);
  });
});

describe("the remedy command survives awkward project paths", () => {
  test("a project root containing spaces is shell-quoted in the hint", () => {
    const home = makeCrewHome();
    const project = join(makeTempDir("crew-proj-"), "my project");
    expect(installSkill(home, "demo", "project", project)).toBe(0);

    const c = captureStreams();
    const code = runCli(["uninstall", "demo"], { home, cwd: project, streams: c.streams });
    expect(code).toBe(6);
    // The `cd` target must be pasteable: quoted, not bare.
    expect(c.stderr()).toContain(`cd '${project}'`);
    expect(c.stderr()).not.toContain(`cd ${project} &&`);
  });

  test("a project root containing a single quote stays pasteable", () => {
    const home = makeCrewHome();
    // The character that breaks naive single-quoting: the closing quote
    // lands early and the rest of the path becomes shell syntax.
    const project = join(makeTempDir("crew-proj-"), "it's mine");
    expect(installSkill(home, "demo", "project", project)).toBe(0);

    const c = captureStreams();
    const code = runCli(["uninstall", "demo"], { home, cwd: project, streams: c.streams });
    expect(code).toBe(6);
    // POSIX escaping: close, escaped literal quote, reopen.
    expect(c.stderr()).toContain(`cd '${project.replace(/'/g, `'\\''`)}'`);
    // A naive quote would have emitted the raw path inside quotes.
    expect(c.stderr()).not.toContain(`cd '${project}'`);
  });

  test("a project entry with no project_root never yields `cd ''`", () => {
    const home = makeCrewHome();
    // `state.json` is user-editable and may predate `project_root`.
    // §11.1 requires it on a project entry; an entry without one cannot
    // produce a runnable remedy, so `readState` drops it.
    writeFileSync(
      join(home, "state.json"),
      JSON.stringify({
        schema_version: 1,
        installations: [
          {
            name: "demo",
            source: { tap: "t", path: "" },
            ref: null,
            resolved_sha: null,
            content_hash: "sha256:x",
            scope: "project",
            installed_at: "2026-01-01T00:00:00Z",
            agents: ["claude-code"],
            pinned: false,
            explicit: true,
            required_by: [],
          },
        ],
      }),
    );

    const c = captureStreams();
    const code = runCli(["uninstall", "demo"], { home, cwd: home, streams: c.streams });
    expect(code).toBe(6);
    expect(c.stderr()).not.toContain("cd ''");
  });
});
