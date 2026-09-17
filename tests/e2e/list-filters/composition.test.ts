/**
 * `crew list` filter composition and flag handling (§5.1, §5.2). Covers
 * C-LIST-06..07: filters compose with each other and with `--scope`, an
 * empty filtered view says so, the `skills` alias inherits list's flags,
 * and a parse-stage failure still honors `--json`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { json, quiet, redirectAdapters, run, seed } from "./helpers.ts";

let restoreAdapters: () => void = () => {};
beforeEach(() => {
  restoreAdapters = redirectAdapters();
});
afterEach(() => {
  restoreAdapters();
});

describe("crew list filter composition", () => {
  test("C-LIST-07 a repeated flag honors --json for the error payload", () => {
    const home = makeCrewHome();
    seed(home);
    const tap = json(home).installations[0]!.source.tap;
    // The failure happens at parse time, before any `ParsedArgs` exists,
    // so the output mode has to be read off raw argv. A script piping
    // stdout must get the structured error rather than human text on
    // stderr it will never see.
    const cap = captureStreams();
    const code = runCli(["list", "--json", "--tap", tap, "--tap", "typo"], {
      home,
      streams: cap.streams,
    });
    expect(code).toBe(4);
    const payload = JSON.parse(cap.stdout()) as {
      error: { name: string; message: string; details: Record<string, unknown> };
    };
    expect(payload.error.name).toBe("usage_error");
    expect(payload.error.message).toContain("`--tap` was given more than once");
    expect(payload.error.details["flag"]).toBe("tap");
    // Last occurrence wins, matching yargs: `--json=false` opts back out.
    const off = captureStreams();
    runCli(["list", "--json", "--json=false", "--tap", tap, "--tap", "typo"], {
      home,
      streams: off.streams,
    });
    expect(off.stdout()).toBe("");
    expect(off.stderr()).toContain("was given more than once");

    // yargs also accepts a SPACE-separated boolean value, so the raw-argv
    // reader has to consume it the same way or it would treat the value
    // as a positional and disagree with the real parse.
    const spaced = captureStreams();
    runCli(["list", "--json", "true", "--tap", tap, "--tap", "typo"], {
      home,
      streams: spaced.streams,
    });
    expect(spaced.stdout()).toContain('"usage_error"');
    const spacedOff = captureStreams();
    runCli(["list", "--json", "false", "--tap", tap, "--tap", "typo"], {
      home,
      streams: spacedOff.streams,
    });
    expect(spacedOff.stdout()).toBe("");
  });

  test("C-LIST-05 the skills alias accepts list's own flags", () => {
    const home = makeCrewHome();
    seed(home);
    const tap = json(home).installations[0]!.source.tap;
    const aliased = run(home, "--json", "--tap", tap);
    const cap = captureStreams();
    const code = runCli(["skills", "--json", "--tap", tap], { home, streams: cap.streams });
    expect(code).toBe(0);
    expect(cap.stdout()).toBe(aliased.out);
  });

  test("C-LIST-07 prefixed aliases keep rejecting flags their subcommand ignores", () => {
    // `taps`/`untap` resolve to `tap list` / `tap remove`, neither of
    // which honours `--recursive`. Bare aliases like `skills` inherit
    // their canonical command's flag table; prefixed ones must not.
    const home = makeCrewHome();
    for (const cmd of ["taps", "untap"]) {
      const c = captureStreams();
      expect(runCli([cmd, "--recursive"], { home, streams: c.streams })).toBe(4);
      expect(c.stderr()).toContain("Unknown argument: recursive");
    }
  });

  test("C-LIST-06 filters compose with each other and with --scope", () => {
    const home = makeCrewHome();
    const projectRoot = seed(home);
    const alphaTap = json(home).installations.find((e) => e.name === "alpha")!.source.tap;
    const hit = json(home, "--agent", "codex", "--tap", alphaTap, "--scope", "user");
    expect(hit.installations.map((e) => e.name)).toEqual(["alpha"]);
    expect(hit.scope).toBe("user");

    // A POSITIVE project-scope case. `seed` installs `gamma` at project
    // scope, so this asserts the three filters compose to select a real
    // row — not merely that an empty fixture yields an empty result,
    // which would pass even if `--scope` were ignored entirely.
    const gammaTap = json(home, "--scope", "project").installations.find((e) => e.name === "gamma")!
      .source.tap;
    const both = json(home, "--agent", "codex", "--tap", gammaTap, "--scope", "project");
    expect(both.installations.map((e) => e.name)).toEqual(["gamma"]);
    expect(both.installations[0]!.project_root).toBe(projectRoot);
    expect(both.scope).toBe("project");

    // And the same filters at the other scope exclude it.
    const miss = json(home, "--agent", "codex", "--tap", gammaTap, "--scope", "user");
    expect(miss.installations.map((e) => e.name)).not.toContain("gamma");
  });

  test("C-LIST-06 an empty row-filtered view says no skills match those filters", () => {
    const home = makeCrewHome();
    seed(home);
    // `gamma` is project-scope but codex-only, so claude-code + project
    // is still genuinely empty — the filters exclude it on the agent.
    const r = run(home, "--agent", "claude-code", "--scope", "project");
    expect(r.code).toBe(0);
    expect(r.out).toContain("No skills match those filters.");
    expect(r.out).not.toContain("get started");
    // Scope alone keeps its own distinct message. `home` now has a
    // project-scope install, so use a home that has only user-scope
    // entries — the point is which message renders, not this fixture.
    const userOnly = makeCrewHome();
    const src = makeTempDir("crew-solo-src-");
    const solo = makeSkill(src, "solo", skillFrontmatter({ name: "solo" }));
    runCli(["install", "--agent", "codex", solo], { home: userOnly, streams: quiet() });
    const scopeOnly = run(userOnly, "--scope", "project");
    expect(scopeOnly.out).toContain("No skills installed at project scope.");
  });
});
