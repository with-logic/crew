/** Completed CLI writers using another state home survive child rollback (§10.1.1). */

import { afterEach, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { installNewTapChild } from "../../../src/install/new-tap-child/index.ts";
import { readState } from "../../../src/state/load.ts";
import { withStateLock } from "../../../src/state/lock.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originalClaude = claudeCodeAdapter.userPath;
const originalCodex = codexAdapter.userPath;
afterEach(() => {
  claudeCodeAdapter.userPath = originalClaude;
  codexAdapter.userPath = originalCodex;
});

for (const prior of [false, true]) {
  test(`C-UPD-38 completed cross-home CLI writer survives rollback ${prior ? "with" : "without"} prior copy`, () => {
    const homeA = makeCrewHome();
    const homeB = makeCrewHome();
    const userHome = makeTempDir();
    const targetRoot = join(userHome, ".claude", "skills");
    const sourceA = makeSkill(
      makeTempDir(),
      "newbie",
      skillFrontmatter({ name: "newbie" }),
      "attempt A bytes",
    );
    const sourceB = makeSkill(
      makeTempDir(),
      "newbie",
      skillFrontmatter({ name: "newbie" }),
      "writer B bytes",
    );
    const dest = join(targetRoot, "newbie");
    const priorMarker = '{"name":"newbie","agents":["claude-code"],"prior":"exact bytes"}';
    if (prior) {
      makeSkill(targetRoot, "newbie", skillFrontmatter({ name: "newbie" }), "prior bytes");
      writeFileSync(join(dest, ".crew.json"), priorMarker);
    }
    const blocked = join(makeTempDir(), "blocked");
    writeFileSync(blocked, "not a directory");
    let competed = false;
    let markerB = Buffer.alloc(0);
    let stateB = Buffer.alloc(0);
    claudeCodeAdapter.userPath = () => targetRoot;
    codexAdapter.userPath = () => {
      const skill = join(dest, "SKILL.md");
      if (
        !competed &&
        existsSync(skill) &&
        readFileSync(skill, "utf8").includes("attempt A bytes")
      ) {
        competed = true;
        const child = Bun.spawnSync(
          [
            process.execPath,
            resolve(import.meta.dir, "../../../src/index.ts"),
            "install",
            sourceB,
            "--agent",
            "claude-code",
            "--force",
            "--json",
          ],
          {
            cwd: userHome,
            env: { ...process.env, HOME: userHome, CREW_HOME: homeB },
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        expect(child.exitCode, new TextDecoder().decode(child.stderr)).toBe(0);
        expect(readFileSync(skill, "utf8")).toContain("writer B bytes");
        markerB = readFileSync(join(dest, ".crew.json"));
        stateB = readFileSync(join(homeB, "state.json"));
        expect(readState(homeB).installations.map((e) => e.name)).toEqual(["newbie"]);
      }
      return blocked;
    };
    let error: CrewError | null = null;
    try {
      withStateLock(
        () =>
          installNewTapChild(
            {
              skillDir: sourceA,
              skillName: "newbie",
              tapRelativePath: "newbie",
              scope: "user",
              tap: {
                name: "fixture",
                kind: "path",
                path: dirname(sourceA),
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
            homeA,
            userHome,
          ),
        homeA,
      );
    } catch (err) {
      expect(err).toBeInstanceOf(CrewError);
      error = err as CrewError;
    }
    expect(error?.code).toBe("usage_error");
    expect(error?.message).toContain(blocked);
    expect(competed).toBe(true);
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("writer B bytes");
    expect(readFileSync(join(dest, ".crew.json"))).toEqual(markerB);
    expect(readFileSync(join(homeB, "state.json"))).toEqual(stateB);
    expect(readState(homeA).installations).toEqual([]);
    const backups = readdirSync(targetRoot).filter((name) => name.startsWith(".crew-rollback-"));
    expect(backups).toHaveLength(prior ? 1 : 0);
    if (prior) {
      const recovery = join(targetRoot, backups[0]!, "prior");
      expect(error?.message).toContain(recovery);
      expect(readFileSync(join(recovery, "SKILL.md"), "utf8")).toContain("prior bytes");
      expect(readFileSync(join(recovery, ".crew.json"), "utf8")).toBe(priorMarker);
    }
  });
}
