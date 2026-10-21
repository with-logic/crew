/** Ownership preflight inspects each physical target and validates marker sources (§5.4, §11.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { nanobotAdapter } from "../../src/agents/nanobot.ts";
import type { TapConfig } from "../../src/core/types.ts";
import { assertChildOwnership } from "../../src/install/tap-reexpand/ownership.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

let root: string;
let ccPath: () => string;
let codexPath: () => string;
beforeEach(() => {
  root = makeTempDir();
  ccPath = claudeCodeAdapter.userPath;
  codexPath = codexAdapter.userPath;
  claudeCodeAdapter.userPath = () => root;
  codexAdapter.userPath = () => root;
});
afterEach(() => {
  claudeCodeAdapter.userPath = ccPath;
  codexAdapter.userPath = codexPath;
});
const tap: TapConfig = {
  name: "incoming",
  kind: "path",
  registered: true,
  path: "/source",
  url: "",
  subpath: "",
};
const args = {
  name: "skill",
  scope: "user" as const,
  projectRoot: null,
  tap,
  tapRelativePath: "skill",
};
const empty = () => ({ byLocation: new Map() });
function marker() {
  return {
    schema_version: 1,
    name: "skill",
    scope: "user",
    tap_name: "alias",
    tap_kind: "path",
    tap_path: "/source",
    tap_url: "",
    tap_subpath: "",
    path: "skill",
  };
}

for (const kind of ["directory", "symlink", "unreadable"] as const) {
  test(`C-INST-14 ${kind} marker cannot establish source ownership`, () => {
    const dest = join(root, "skill");
    mkdirSync(dest);
    const file = join(dest, ".crew.json");
    if (kind === "directory") mkdirSync(file);
    if (kind === "symlink") symlinkSync(join(root, "absent"), file);
    if (kind === "unreadable") {
      writeFileSync(file, JSON.stringify(marker()));
      chmodSync(file, 0);
    }
    try {
      expect(() => assertChildOwnership(empty(), args, ["claude-code"])).toThrow(
        expect.objectContaining({ code: "name_conflict" }),
      );
    } finally {
      if (kind === "unreadable") chmodSync(file, 0o644);
    }
  });
}

test("C-INST-13j same path source aliases share a physical target", () => {
  const dest = join(root, "skill");
  mkdirSync(dest);
  writeFileSync(join(dest, ".crew.json"), JSON.stringify(marker()));
  expect(() =>
    assertChildOwnership(empty(), args, ["unknown", "claude-code", "codex"]),
  ).not.toThrow();
});

test("C-INST-14 malformed path roots and empty git URLs cannot establish ownership", () => {
  const dest = join(root, "skill");
  mkdirSync(dest);
  for (const source of [
    { ...marker(), tap_path: "relative" },
    { ...marker(), tap_kind: "git", tap_url: "" },
  ]) {
    writeFileSync(join(dest, ".crew.json"), JSON.stringify(source));
    expect(() => assertChildOwnership(empty(), args, ["claude-code"])).toThrow(
      expect.objectContaining({ code: "name_conflict" }),
    );
  }
});

test("C-INST-14 untracked destinations retain the installer contract", () => {
  expect(() => assertChildOwnership(empty(), args, ["claude-code"])).not.toThrow();
  writeFileSync(join(root, "skill"), "untracked file");
  expect(() => assertChildOwnership(empty(), args, ["claude-code"])).not.toThrow();
  rmSync(join(root, "skill"));
});

test("C-INST-14 inaccessible target ownership fails closed", () => {
  chmodSync(root, 0);
  try {
    expect(() => assertChildOwnership(empty(), args, ["claude-code"])).toThrow(
      expect.objectContaining({ code: "name_conflict" }),
    );
  } finally {
    chmodSync(root, 0o755);
  }
});

test("C-INST-13e unsupported scope has no physical target to inspect", () => {
  const original = nanobotAdapter.userPath;
  nanobotAdapter.userPath = () => "";
  try {
    expect(() => assertChildOwnership(empty(), args, ["nanobot"])).not.toThrow();
  } finally {
    nanobotAdapter.userPath = original;
  }
});
