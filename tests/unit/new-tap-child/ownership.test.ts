/** Marker-only detach, symlinks, removal, and unreadability revoke rollback ownership (§10.1.1). */

import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { uninstallSkillFromAgents } from "../../../src/agents/uninstall.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { installNewTapChild } from "../../../src/install/new-tap-child/index.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originalClaude = claudeCodeAdapter.userPath;
const originalCodex = codexAdapter.userPath;
afterEach(() => {
  claudeCodeAdapter.userPath = originalClaude;
  codexAdapter.userPath = originalCodex;
});

for (const change of ["detach", "remove", "unreadable", "symlink"] as const) {
  test(`C-UPD-38 later ${change} preserves current target and reports prior copy`, () => {
    const root = makeTempDir();
    const dest = makeSkill(root, "newbie", skillFrontmatter({ name: "newbie" }), "prior bytes");
    writeFileSync(
      join(dest, ".crew.json"),
      JSON.stringify({
        name: "newbie",
        agents: change === "detach" ? ["claude-code", "cursor"] : ["claude-code"],
      }),
    );
    const source = makeSkill(
      makeTempDir(),
      "newbie",
      skillFrontmatter({ name: "newbie" }),
      "attempt A bytes",
    );
    const blocked = join(makeTempDir(), "blocked");
    writeFileSync(blocked, "not a directory");
    claudeCodeAdapter.userPath = () => root;
    let changed = false;
    let marker = Buffer.alloc(0);
    let inode = 0;
    const outside = join(makeTempDir(), "controlled-writer-marker");
    codexAdapter.userPath = () => {
      if (!changed && readFileSync(join(dest, "SKILL.md"), "utf8").includes("attempt A bytes")) {
        changed = true;
        inode = lstatSync(dest).ino;
        if (change === "unreadable") chmodSync(join(dest, ".crew.json"), 0o000);
        else if (change === "symlink") {
          marker = readFileSync(join(dest, ".crew.json"));
          writeFileSync(outside, marker);
          rmSync(join(dest, ".crew.json"));
          symlinkSync(outside, join(dest, ".crew.json"));
          expect(lstatSync(dest).ino).toBe(inode);
        } else {
          const result = uninstallSkillFromAgents({
            agents: [claudeCodeAdapter],
            scope: "user",
            cwd: root,
            skillName: "newbie",
            force: false,
            dryRun: false,
          });
          expect(result.kind).toBe(change === "detach" ? "detached" : "removed");
          if (change === "detach") {
            expect(lstatSync(dest).ino).toBe(inode);
            marker = readFileSync(join(dest, ".crew.json"));
            expect(JSON.parse(marker.toString()).agents).toEqual(["cursor"]);
          }
        }
      }
      return blocked;
    };
    let error: CrewError | null = null;
    try {
      installNewTapChild(
        {
          skillDir: source,
          skillName: "newbie",
          tapRelativePath: "newbie",
          scope: "user",
          tap: {
            name: "fixture",
            kind: "path",
            path: source,
            url: "",
            subpath: "",
            registered: true,
          },
          agents: ["claude-code", "codex"],
          resolvedSha: "attempt-a",
          projectRoot: null,
          ref: null,
          pinned: false,
        },
        true,
        makeCrewHome(),
        root,
      );
    } catch (err) {
      expect(err).toBeInstanceOf(CrewError);
      error = err as CrewError;
    } finally {
      if (change === "unreadable") chmodSync(join(dest, ".crew.json"), 0o644);
    }
    expect(changed).toBe(true);
    expect(error?.code).toBe("usage_error");
    expect(error?.message).toContain(blocked);
    expect(existsSync(dest)).toBe(change !== "remove");
    if (change === "symlink") {
      expect(lstatSync(join(dest, ".crew.json")).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(dest, ".crew.json"))).toBe(outside);
      expect(readFileSync(outside)).toEqual(marker);
    }
    if (change !== "remove") {
      expect(lstatSync(dest).ino).toBe(inode);
      expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("attempt A bytes");
      if (change === "detach") expect(readFileSync(join(dest, ".crew.json"))).toEqual(marker);
    }
    expect(error?.message).toContain("rollback");
    const backups = readdirSync(root).filter((name) => name.startsWith(".crew-rollback-"));
    expect(backups).toHaveLength(1);
    const recovery = join(root, backups[0]!, "prior");
    expect(error?.message).toContain(recovery);
    expect(readFileSync(join(recovery, "SKILL.md"), "utf8")).toContain("prior bytes");
  });
}
