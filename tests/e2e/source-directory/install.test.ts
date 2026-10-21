/** Source directory discovery reports operational errors through install and dependencies (§9, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target: string;
beforeEach(() => {
  target = makeTempDir();
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const mode of [0o111, 0o444]) {
  for (const layout of ["root", "skills", "namespace", "recursive"]) {
    test(`install reports inaccessible ${layout} directory (${mode.toString(8)})`, () => {
      const home = makeCrewHome();
      const root = makeTempDir();
      const relative = {
        root: "",
        skills: "skills",
        namespace: "skills/team",
        recursive: "team/work",
      };
      const blocked = join(root, relative[layout as keyof typeof relative]);
      mkdirSync(blocked, { recursive: true });
      makeSkill(blocked, "demo", skillFrontmatter({ name: "demo" }));
      chmodSync(blocked, mode);
      try {
        const capture = captureStreams();
        const args = ["install", root, "--agent", "claude-code", "--json"];
        if (layout === "recursive") args.push("--recursive");
        expect(runCli(args, { home, streams: capture.streams })).toBe(5);
        const error = JSON.parse(capture.stdout()).error;
        expect(error.name).toBe("source_unreachable");
        expect(error.message).toContain("EACCES");
        expect(error.message).toContain(blocked);
        expect(readState(home).installations).toEqual([]);
        expect(existsSync(join(target, "demo"))).toBe(false);
      } finally {
        chmodSync(blocked, 0o755);
      }
    });
  }
}

test("recursive discovery probes an unsearchable skill at its maximum depth", () => {
  const root = makeTempDir();
  const parent = join(root, "one", "two", "three", "four");
  mkdirSync(parent, { recursive: true });
  const blocked = makeSkill(parent, "demo", skillFrontmatter({ name: "demo" }));
  chmodSync(blocked, 0o444);
  try {
    const capture = captureStreams();
    expect(
      runCli(["install", root, "--recursive", "--json"], {
        home: makeCrewHome(),
        streams: capture.streams,
      }),
    ).toBe(5);
    expect(JSON.parse(capture.stdout()).error.name).toBe("source_unreachable");
    expect(capture.stdout()).toContain(blocked);
  } finally {
    chmodSync(blocked, 0o755);
  }
});

for (const blockedSibling of [false, true]) {
  test(`dependency discovery reports an inaccessible ${blockedSibling ? "sibling" : "parent listing"}`, () => {
    const root = makeTempDir();
    const parent = makeSkill(
      root,
      "parent",
      skillFrontmatter({ name: "parent", dependencies: ["dep"] }),
    );
    const dep = makeSkill(root, "dep", skillFrontmatter({ name: "dep" }));
    const blocked = blockedSibling ? dep : root;
    chmodSync(blocked, blockedSibling ? 0o444 : 0o111);
    try {
      const capture = captureStreams();
      const home = makeCrewHome();
      expect(
        runCli(["install", parent, "--agent", "claude-code", "--json"], {
          home,
          streams: capture.streams,
        }),
      ).toBe(5);
      expect(JSON.parse(capture.stdout()).error.name).toBe("source_unreachable");
      expect(capture.stdout()).toContain(blocked);
      expect(readState(home).installations).toEqual([]);
    } finally {
      chmodSync(blocked, 0o755);
    }
  });
}

test("a searchable but nonlistable single-skill source reports a directory failure", () => {
  const home = makeCrewHome();
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  chmodSync(skill, 0o111);
  try {
    const capture = captureStreams();
    expect(
      runCli(["install", skill, "--agent", "claude-code", "--json"], {
        home,
        streams: capture.streams,
      }),
    ).toBe(5);
    expect(JSON.parse(capture.stdout()).error.name).toBe("source_unreachable");
    expect(capture.stdout()).toContain(skill);
  } finally {
    chmodSync(skill, 0o755);
  }
});
