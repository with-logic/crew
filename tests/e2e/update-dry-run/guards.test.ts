/**
 * Guarantees a `crew update --dry-run` must hold beyond the happy-path
 * preview: it never creates `state.json` (C-UPD-18a), an invalid new
 * tap child fails rather than being previewed as an addition
 * (C-UPD-18c, C-UPD-18e), and `--force` previews a pinned skill without
 * writing (C-UPD-18b).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../../helpers/fixtures.ts";
import { ccRoot, redirectClaudeCode, snapshotInstalledState, type UpdateJson } from "./helpers.ts";

redirectClaudeCode();

describe("crew update --dry-run guarantees", () => {
  test("C-UPD-18a never creates state.json on a home that has none", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // `tap remove` rewrites config but leaves no state file behind.
    rmSync(paths(home).stateFile, { force: true });
    expect(existsSync(paths(home).stateFile)).toBe(false);

    const c = captureStreams();
    expect(runCli(["update", "--dry-run"], { home, streams: c.streams })).toBe(0);

    // Acquiring the state lock would touch `state.json` into existence;
    // a dry run must not take it (§14).
    expect(existsSync(paths(home).stateFile)).toBe(false);
    expect(existsSync(`${paths(home).stateFile}.lock`)).toBe(false);
  });

  test("C-UPD-18c/18e an invalid new tap child fails and is named in output", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-dry-invalid-");
    makeGitRepo(repo);
    makeSkill(repo, "good", skillFrontmatter({ name: "good", description: "fine" }));
    commitAll(repo, "v1");
    expect(runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams })).toBe(
      0,
    );

    // A sibling whose name is valid but whose frontmatter is not:
    // discovery reads the name only, so it is found but must not
    // install (§9 step 4).
    makeSkill(repo, "bad", "name: bad");
    commitAll(repo, "v2");

    const dry = captureStreams();
    expect(runCli(["update", "--dry-run", "--json"], { home, streams: dry.streams })).toBe(1);
    const parsed = JSON.parse(dry.stdout()) as UpdateJson;
    const badRow = parsed.tap_reexpand_rows.find((r) => r.name === "bad")!;
    expect(badRow.kind).toBe("tap_error");
    expect(badRow.error?.code).toBe("invalid_skill");

    // C-UPD-18e: the human output has to name the offending child and
    // say why — the user is the one who has to go fix it — and count it
    // among the failures.
    const human = captureStreams();
    expect(runCli(["update", "--dry-run"], { home, streams: human.streams })).toBe(1);
    expect(human.stdout()).toContain("bad");
    expect(human.stdout()).toContain("invalid_skill");
    expect(human.stdout()).toContain("description");
    expect(human.stdout()).toContain("1 failure");

    // The real run agrees: same failure, and nothing lands on disk.
    expect(runCli(["update"], { home, streams: captureStreams().streams })).toBe(1);
    expect(existsSync(join(ccRoot, "bad"))).toBe(false);
  });

  test("C-UPD-18b --force --dry-run previews a pinned skill without writing", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-dry-pinned-");
    makeGitRepo(repo);
    makeSkill(repo, "delta", skillFrontmatter({ name: "delta", description: "v1" }), "body v1\n");
    commitAll(repo, "v1");
    tagRepo(repo, "v1.0.0");
    expect(
      runCli(["install", `file://${repo}@v1.0.0`], { home, streams: captureStreams().streams }),
    ).toBe(0);

    writeFileSync(
      join(repo, "delta", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "delta", description: "v2" })}\n---\nbody v2\n`,
    );
    commitAll(repo, "v2");
    const before = snapshotInstalledState(home);

    // Without --force a pinned entry is skipped outright.
    const plain = captureStreams();
    expect(runCli(["update", "--dry-run", "--json"], { home, streams: plain.streams })).toBe(0);
    expect((JSON.parse(plain.stdout()) as UpdateJson).rows[0]!.outcome.kind).toBe("skipped");

    // With --force it previews the move but still writes nothing.
    const forced = captureStreams();
    expect(
      runCli(["update", "--dry-run", "--force", "--json"], { home, streams: forced.streams }),
    ).toBe(0);
    expect((JSON.parse(forced.stdout()) as UpdateJson).rows[0]!.outcome.kind).toBe("would_update");
    expect(snapshotInstalledState(home)).toEqual(before);
    expect(readFileSync(join(ccRoot, "delta", "SKILL.md"), "utf8")).toContain("body v1");
  });
});
