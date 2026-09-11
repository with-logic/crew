/**
 * C-TAP-25: crew never deletes outside the directory it owns.
 *
 * A tap name becomes a directory under `~/.crew/taps/` and reaches the
 * clone path from `config.yaml`, so it is persisted text flowing into a
 * recursive delete. Two defences: the config parser rejects a name that
 * isn't a single directory component, and the deletion sites refuse any
 * target that resolves outside the taps directory.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { isInside, rmrfInside } from "../../../src/util/fs.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

describe("C-TAP-25 deletion stays inside the managed root", () => {
  test("C-TAP-25 rmrfInside refuses a target outside the root", () => {
    const root = makeTempDir("crew-root-");
    const managed = join(root, "taps");
    const victim = join(root, "PRECIOUS");
    mkdirSync(managed, { recursive: true });
    mkdirSync(victim, { recursive: true });
    writeFileSync(join(victim, "data.txt"), "must survive");

    // The shape a traversal name produces: `<taps>/../PRECIOUS`.
    expect(rmrfInside(managed, join(managed, "..", "PRECIOUS"))).toBe(false);
    expect(existsSync(join(victim, "data.txt"))).toBe(true);

    // A real child is still removed.
    const child = join(managed, "acme");
    mkdirSync(child, { recursive: true });
    expect(rmrfInside(managed, child)).toBe(true);
    expect(existsSync(child)).toBe(false);
  });

  test("C-TAP-25 isInside rejects the root itself and escapes", () => {
    const root = makeTempDir("crew-inside-");
    expect(isInside(root, join(root, "child"))).toBe(true);
    expect(isInside(root, join(root, "a", "b"))).toBe(true);
    // The root is not "inside" itself — deleting it is never intended.
    expect(isInside(root, root)).toBe(false);
    expect(isInside(root, join(root, ".."))).toBe(false);
    expect(isInside(root, makeTempDir("crew-other-"))).toBe(false);
  });

  test("C-TAP-25 a traversal tap name in config is rejected on load", () => {
    const home = makeCrewHome();
    const p = paths(home);
    mkdirSync(p.tapsDir, { recursive: true });
    const victim = join(home, "PRECIOUS");
    mkdirSync(victim, { recursive: true });
    writeFileSync(join(victim, "data.txt"), "must survive");

    // Hand-write a config carrying a traversal name, as a corrupted or
    // hostile file would.
    writeFileSync(
      p.configFile,
      [
        "taps:",
        "  - name: ../PRECIOUS",
        "    kind: git",
        "    registered: false",
        "    url: https://example.com/acme/skills.git",
        "    subpath: ''",
        "disabled_agents: []",
        "forced_agents: []",
        "",
      ].join("\n"),
    );

    // `tap list` reads config; `list` reads only state, so it would
    // never reach the parser this test is about.
    const cap = captureStreams();
    const code = runCli(["tap", "list"], { home, streams: cap.streams });

    expect(code).toBe(4);
    expect(cap.stderr()).toContain("config_invalid");
    expect(existsSync(join(victim, "data.txt"))).toBe(true);
  });
});
