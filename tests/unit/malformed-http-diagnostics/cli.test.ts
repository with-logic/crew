/** Rejected HTTP separator refs stay invalid without transport, writes, or credential output (§13, C-CLI-06c). */

import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { runCli } from "../../../src/cli/main.ts";
import { parseRef } from "../../../src/refs/parse.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { remoteGitViolations } from "../../helpers/no-network.ts";
import { SECRET } from "./cases.ts";

const REJECTED = [
  String.raw`https:\\${SECRET}@host.invalid/o/r`,
  `https:${SECRET}@host.invalid/o/r`,
  `http:/${SECRET}@host.invalid/o/r`,
  `https:/\\${SECRET}@host.invalid/o/r`,
  `ht\ttps:\\${SECRET}@host.invalid/o/r`,
  `https :\\${SECRET}@host.invalid/o/r`,
  `https:\u0085\\${SECRET}@host.invalid/o/r`,
];

for (const raw of REJECTED) {
  test.each([false, true])(
    `C-CLI-06c rejected separator ref ${JSON.stringify(raw)} (json=%j)`,
    (json) => {
      const home = makeCrewHome();
      const cwd = makeTempDir();
      const source = join(cwd, "source.txt");
      writeFileSync(source, "unchanged source bytes\n");
      const state = join(home, "state.json");
      writeFileSync(state, '{"schema_version":1,"installations":[]}\n');
      const configBefore = readFileSync(join(home, "config.yaml"));
      const stateBefore = readFileSync(state);
      const sourceBefore = readFileSync(source);
      const previous = ALL_AGENTS.map((agent) => ({
        agent,
        userPath: agent.userPath,
        projectPath: agent.projectPath,
        detect: agent.detect,
      }));
      const installed = join(home, "owned-installed", "KEEP.txt");
      mkdirSync(join(home, "owned-installed"));
      writeFileSync(installed, "unchanged install bytes\n");
      try {
        for (const { agent } of previous) {
          agent.userPath = () => join(home, "owned-installed", agent.name);
          agent.projectPath = () => join(cwd, "owned-installed", agent.name);
          agent.detect = () => agent.name === "claude-code";
        }
        expect(() => parseRef(raw, cwd)).toThrow(expect.objectContaining({ code: "invalid_ref" }));
        const capture = captureStreams();
        expect(
          runCli(["install", raw, ...(json ? ["--json"] : [])], {
            home,
            cwd,
            streams: capture.streams,
          }),
        ).toBe(4);
        expect(capture.stdout() + capture.stderr()).not.toContain(SECRET);
        if (json) {
          const payload = JSON.parse(capture.stdout());
          expect(Object.keys(payload)).toEqual(["error"]);
          expect(Object.keys(payload.error)).toEqual(["name", "message", "details"]);
          expect(payload.error.name).toBe("invalid_ref");
          expect(Object.keys(payload.error.details)).toEqual(["ref"]);
          expect(capture.stderr()).toBe("");
        } else {
          expect(capture.stdout()).toBe("");
          expect(capture.stderr()).toContain("invalid_ref");
          expect(capture.stderr()).toContain("Next step");
          expect(capture.stderr()).toContain("Run `crew help install` for examples.");
        }
        expect(remoteGitViolations()).toEqual([]);
        expect(readFileSync(join(home, "config.yaml"))).toEqual(configBefore);
        expect(readFileSync(state)).toEqual(stateBefore);
        expect(readFileSync(source)).toEqual(sourceBefore);
        expect(readFileSync(installed, "utf8")).toBe("unchanged install bytes\n");
        expect(existsSync(join(home, "owned-installed", "claude-code"))).toBe(false);
      } finally {
        for (const { agent, userPath, projectPath, detect } of previous) {
          agent.userPath = userPath;
          agent.projectPath = projectPath;
          agent.detect = detect;
        }
      }
    },
  );
}
