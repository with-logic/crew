/**
 * `crew outdated` when a collection can't be reached (§10.1.1,
 * C-UPD-18f).
 *
 * Two degrees of failure, both driven by local `file://` origins that
 * are made to disappear — never the network:
 *
 *   - retained clone, dead origin → refresh warns, the cached answer
 *     still renders, exit stays 0 (matching `crew update`);
 *   - clone deleted AND configured URL dead → the tap can't be
 *     acquired at all, which is a hard failure.
 *
 * The load-bearing assertion is that neither case prints an
 * unqualified "Everything is up to date." — that would claim we
 * checked upstream when we could not.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { breakTapOrigin, installedFromRepo, moveUpstream, useClaudeCodeRoot } from "./helpers.ts";

useClaudeCodeRoot();

describe("C-UPD-18f crew outdated with an unreachable collection", () => {
  test("does not claim up to date when a tap couldn't be refreshed", () => {
    const { home } = installedFromRepo();
    // Clone retained but origin dead: refresh fails while every locally
    // known row reads up_to_date. Filtering those rows away must not
    // leave an unqualified all-clear — we never saw upstream.
    const tapName = readdirSync(paths(home).tapsDir)[0]!;
    breakTapOrigin(home, tapName);

    const c = captureStreams();
    expect(runCli(["outdated"], { home, streams: c.streams })).toBe(0);
    const out = c.stdout();
    expect(out).toContain("couldn't refresh tap");
    expect(out).not.toContain("Everything is up to date.");
    expect(out).toContain("couldn't be checked");
  });

  test("warns but still reports known pending changes, and flags the answer as partial", () => {
    const { home, repo } = installedFromRepo();
    const project = makeTempDir("crew-proj-");
    expect(
      runCli(["install", "--scope", "project", `file://${repo}`], {
        home,
        cwd: project,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    moveUpstream(repo, "alpha");

    const c = captureStreams();
    expect(runCli(["outdated"], { home, cwd: project, streams: c.streams })).toBe(0);
    expect(c.stdout()).toContain("2 skills would change");
    expect(c.stdout()).toContain(`(in ${project}`);

    // Retained clone, dead origin: a warning, not a failure — exit 0.
    const tapName = readdirSync(paths(home).tapsDir)[0]!;
    breakTapOrigin(home, tapName);
    const warn = captureStreams();
    expect(runCli(["outdated"], { home, cwd: project, streams: warn.streams })).toBe(0);
    expect(warn.stdout()).toContain("couldn't refresh tap");
    // Known pending changes still render; the answer is just flagged partial.
    expect(warn.stdout()).toContain("would change");
    expect(warn.stdout()).toContain("results may be incomplete");
  });

  test("a tap that cannot be acquired at all exits like update --dry-run", () => {
    const { home, repo } = installedFromRepo();
    const tapName = readdirSync(paths(home).tapsDir)[0]!;

    // Clone gone AND configured URL dead: re-expansion can't acquire
    // the tap, so a tap-level error row renders.
    rmSync(join(paths(home).tapsDir, tapName), { recursive: true, force: true });
    const cfg = join(home, "config.yaml");
    writeFileSync(
      cfg,
      readFileSync(cfg, "utf8").replaceAll(`file://${repo}`, "file:///does/not/exist/crew-gone"),
    );

    const dead = captureStreams();
    const deadCode = runCli(["outdated"], { home, streams: dead.streams });
    expect(dead.stdout()).toContain("couldn't refresh tap");
    expect(dead.stdout()).toMatch(/tap \S+ \(source_unreachable\)/);
    expect(dead.stdout()).not.toContain("Everything is up to date.");

    // Whatever `crew update --dry-run` exits with, `outdated` must match:
    // the two commands share one flow and one exit-code rule.
    const mirror = captureStreams();
    expect(deadCode).toBe(runCli(["update", "--dry-run"], { home, streams: mirror.streams }));
  });
});
