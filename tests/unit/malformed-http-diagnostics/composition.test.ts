/** Original URL authorities and older zero-separator candidates survive diagnostic composition (§13, C-CLI-06c). */

import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { runCli } from "../../../src/cli/main.ts";
import { writeError } from "../../../src/cli/output.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { displayDetails, displayText, displayUrl } from "../../../src/refs/display-url.ts";
import { parseRef } from "../../../src/refs/parse.ts";
import { redactText, safeUrl } from "../../../src/util/redact.ts";
import { makeStyler } from "../../../src/util/term.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { remoteGitViolations } from "../../helpers/no-network.ts";

const overlaps = [1, 2].flatMap((count) =>
  ["", "\t", "\n", "\\x09"].map(
    (control) =>
      `http:early-secret${control} https:${"\\".repeat(count)}later-secret@host.invalid/repo`,
  ),
);

test.each(overlaps)(
  "C-CLI-06c an older authority wins over a later guaranteed cut (case %#)",
  (raw) => {
    expect(displayText(`operation: ${raw}`)).toBe("operation: ***");
    expect(redactText(`operation: ${raw}`)).toBe("operation: ***");
    expect(displayDetails({ ref: raw })).toEqual({ ref: "***" });
  },
);

const outerAuthorities = [
  "https://probe-secret_https:@host.invalid/repo",
  ...[1, 2].map(
    (count) => `https://probe-secret_https:${"\\".repeat(count)}tail@host.invalid/repo`,
  ),
];

test.each(outerAuthorities)(
  "C-CLI-06c an inner cut cannot expose an outer authority (case %#)",
  (raw) => {
    expect(displayText(`operation: ${raw}`)).toBe("operation: ***");
    expect(redactText(`operation: ${raw}`)).toBe("operation: ***");
    expect(displayDetails({ ref: raw })).toEqual({ ref: "***" });
    for (const json of [false, true]) {
      const output = captureStreams();
      writeError(
        new CrewError("invalid_ref", `operation: ${raw}`, { ref: raw }),
        json,
        output.streams,
        makeStyler(false),
      );
      expect(output.stdout() + output.stderr()).not.toContain("probe-secret");
    }
  },
);

test("C-CLI-06c composition retains harmless labels and whole structured URL rendering", () => {
  for (const raw of [
    "HTTP: request https:/later-secret@host.invalid/repo",
    "HTTP: request https:\\no-userinfo",
  ]) {
    expect(displayText(raw)).toBe("HTTP: request ***");
    expect(redactText(raw)).toBe("HTTP: request ***");
  }
  const whole = "https://probe-secret_https:@host.invalid/repo";
  expect(displayUrl(whole)).toBe("https://***@host.invalid/repo");
  expect(safeUrl(whole)).toBe("https://***@host.invalid/repo");
});

test.each([false, true])(
  "C-CLI-06c rejected overlap remains safe through runCli (json=%j)",
  (json) => {
    const home = makeCrewHome();
    const cwd = makeTempDir();
    const state = join(home, "state.json");
    writeFileSync(state, '{"schema_version":1,"installations":[]}\n');
    const beforeState = readFileSync(state);
    const config = join(home, "config.yaml");
    const beforeConfig = readFileSync(config);
    const prior = ALL_AGENTS.map((agent) => ({
      agent,
      userPath: agent.userPath,
      projectPath: agent.projectPath,
      detect: agent.detect,
    }));
    const raw = "http:early-secret https:\\later-secret@host.invalid/repo";
    try {
      for (const { agent } of prior) {
        agent.userPath = () => join(home, "owned-targets", agent.name);
        agent.projectPath = () => join(cwd, "owned-targets", agent.name);
        agent.detect = () => agent.name === "claude-code";
      }
      expect(() => parseRef(raw, cwd)).toThrow(expect.objectContaining({ code: "invalid_ref" }));
      const output = captureStreams();
      expect(
        runCli(["install", raw, ...(json ? ["--json"] : [])], {
          home,
          cwd,
          streams: output.streams,
        }),
      ).toBe(4);
      expect(output.stdout() + output.stderr()).not.toContain("early-secret");
      expect(output.stdout() + output.stderr()).not.toContain("later-secret");
      expect(readFileSync(state)).toEqual(beforeState);
      expect(readFileSync(config)).toEqual(beforeConfig);
      expect(remoteGitViolations()).toEqual([]);
    } finally {
      for (const { agent, userPath, projectPath, detect } of prior)
        Object.assign(agent, { userPath, projectPath, detect });
    }
  },
);
