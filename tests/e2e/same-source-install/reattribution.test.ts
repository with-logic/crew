/**
 * C-INST-13b: re-attribution onto the incoming tap.
 *
 * When the same canonical location is reached through a different tap
 * row, the entry's attribution moves and the install-site markers follow
 * (§5.4, §16.5). A move in one project never rewrites another project's
 * marker, and the destination tap's discovery mode wins over whatever the
 * old marker carried.
 *
 * The cases where attribution must NOT move live in
 * `attribution-kept.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { tapPath } from "../../../src/core/paths.ts";
import type { Marker } from "../../../src/core/types.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { type AdapterRedirect, buildRepo, install, redirectClaudeCode } from "./helpers.ts";

let cc: AdapterRedirect;

beforeEach(() => {
  cc = redirectClaudeCode();
});
afterEach(() => {
  cc.restore();
});

/**
 * Install into `project` at project scope. Returns the exit code with
 * stdout so callers assert inside their own test body — Biome's
 * `noMisplacedAssertion` forbids asserting from a helper.
 */
function installInProject(
  home: string,
  project: string,
  ref: string,
): { code: number; out: string } {
  const cap = captureStreams();
  const code = runCli(["install", "--scope", "project", ref, "--agent", "claude-code"], {
    home,
    cwd: project,
    streams: cap.streams,
  });
  return { code, out: cap.stdout() };
}

/** Read the marker a project-scope install wrote. */
function projectMarker(project: string, name: string): Marker {
  return JSON.parse(
    readFileSync(join(project, ".claude", "skills", name, ".crew.json"), "utf8"),
  ) as Marker;
}

describe("C-INST-13b re-attribution to the incoming tap", () => {
  test("C-INST-13b moves state and markers, then GCs the emptied auto tap", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx", "pdf"]);

    install(home, `file://${repo}//skills/docx`);
    const narrowTap = readState(home).installations.find((e) => e.name === "docx")!.source.tap;
    expect(existsSync(tapPath(narrowTap, home))).toBe(true);

    const second = install(home, `file://${repo}`);
    expect(second.out).toContain("now tracked via");

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    const broadTap = entry.source.tap;
    expect(broadTap).not.toBe(narrowTap);
    expect(entry.source.path).toBe("skills/docx");

    // Marker follows state, since markers are authoritative (§11.1).
    const marker = JSON.parse(readFileSync(join(cc.root, "docx", ".crew.json"), "utf8")) as Marker;
    expect(marker.tap_name).toBe(broadTap);
    expect(marker.path).toBe("skills/docx");
    expect(marker.tap_subpath).toBe("");

    // The emptied auto tap and its clone are gone (§16.5).
    expect(readConfig(home).taps.some((t) => t.name === narrowTap)).toBe(false);
    expect(existsSync(tapPath(narrowTap, home))).toBe(false);
  });

  test("C-INST-13b re-attributes a project-scope install and its marker", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    const repo = buildRepo(["docx"]);

    expect(installInProject(home, project, `file://${repo}//skills/docx`).code).toBe(0);
    const narrowTap = readState(home).installations[0]!.source.tap;

    const second = installInProject(home, project, `file://${repo}`);
    expect(second.code).toBe(0);
    expect(second.out).toContain("now tracked via");

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    expect(entry.scope).toBe("project");
    expect(entry.source.tap).not.toBe(narrowTap);
    expect(entry.source.path).toBe("skills/docx");

    // The project-scope marker follows too (§11.1).
    const marker = projectMarker(project, "docx");
    expect(marker.tap_name).toBe(entry.source.tap);
    expect(marker.path).toBe("skills/docx");
  });

  test("C-INST-13f a move in one project leaves another project's marker alone", () => {
    const home = makeCrewHome();
    const projectA = makeTempDir("crew-proj-a-");
    const projectB = makeTempDir("crew-proj-b-");
    const repo = buildRepo(["docx"]);

    // Both projects install the same skill through the same narrow tap.
    expect(installInProject(home, projectA, `file://${repo}//skills/docx`).code).toBe(0);
    expect(installInProject(home, projectB, `file://${repo}//skills/docx`).code).toBe(0);
    const narrowTap = readState(home).installations[0]!.source.tap;
    const beforeB = projectMarker(projectB, "docx");
    expect(beforeB.tap_name).toBe(narrowTap);

    // Only project A re-attributes.
    expect(installInProject(home, projectA, `file://${repo}`).code).toBe(0);

    const entries = readState(home).installations.filter((e) => e.name === "docx");
    const a = entries.find((e) => e.project_root === projectA)!;
    const b = entries.find((e) => e.project_root === projectB)!;
    expect(a.source.tap).not.toBe(narrowTap);
    // B's state never moved, so B's marker must still match it.
    expect(b.source.tap).toBe(narrowTap);
    expect(projectMarker(projectB, "docx")).toEqual(beforeB);
  });

  test("C-INST-13g re-attribution drops discovery inherited from the old tap", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx", "pdf"]);

    // `--recursive` on a direct install creates a RECURSIVE auto tap.
    // It must be an auto tap: a registered one is never re-attributed.
    const first = captureStreams();
    expect(
      runCli(["install", `file://${repo}//skills/docx`, "--recursive", "--agent", "claude-code"], {
        home,
        streams: first.streams,
      }),
    ).toBe(0);
    const before = JSON.parse(
      readFileSync(join(cc.root, "docx", ".crew.json"), "utf8"),
    ) as Marker & { tap_discovery?: string };
    expect(before.tap_discovery).toBe("recursive");

    // Now install the whole repo without `--recursive`: the destination
    // tap has standard discovery, so the marker must stop claiming
    // recursive rather than inheriting it from the old one.
    expect(install(home, `file://${repo}`).code).toBe(0);

    const after = JSON.parse(
      readFileSync(join(cc.root, "docx", ".crew.json"), "utf8"),
    ) as Marker & { tap_discovery?: string };
    expect(after.tap_name).not.toBe(before.tap_name);
    const tap = readConfig(home).taps.find((t) => t.name === after.tap_name)!;
    expect(tap.discovery).toBeUndefined();
    expect(after.tap_discovery).toBeUndefined();
  });

  test("C-INST-13b reports the previous tap in --json", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx"]);
    install(home, `file://${repo}//skills/docx`);
    const narrowTap = readState(home).installations[0]!.source.tap;

    const cap = captureStreams();
    runCli(["install", `file://${repo}`, "--agent", "claude-code", "--json"], {
      home,
      streams: cap.streams,
    });
    const payload = JSON.parse(cap.stdout()) as {
      already_installed: { name: string; reattributedFrom?: string }[];
    };
    const docx = payload.already_installed.find((a) => a.name === "docx")!;
    expect(docx.reattributedFrom).toBe(narrowTap);
  });
});
