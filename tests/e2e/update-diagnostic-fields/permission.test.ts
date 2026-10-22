/** Real unreadable tap diagnostics escape labels and redact messages in both modes (§5.2, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import type { StateEntry } from "../../../src/core/types.ts";
import type { TapReexpandRow } from "../../../src/install/tap-reexpand/types.ts";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { invoke, snapshot } from "./fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target = "";
beforeEach(() => {
  target = makeTempDir("crew-fields-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
});

test("C-CLI-06b real tap errors protect fields in update, preview, and outdated", () => {
  const home = makeCrewHome();
  expect(invoke(home, ["tap", "remove", "core", "--force"]).code).toBe(0);
  const parent = join(makeTempDir(), "private?token=FIELD_MESSAGE_SECRET");
  const tap = "broken-\n\x1b\x85";
  const root = join(parent, tap);
  mkdirSync(root, { recursive: true });
  const sourcePath = "source-\n\x1b\x85";
  const broken = makeSkill(root, sourcePath, skillFrontmatter({ name: "broken" }));
  const healthy = makeSkill(makeTempDir(), "healthy", skillFrontmatter({ name: "healthy" }));
  expect(invoke(home, ["install", root, healthy, "--agent", "claude-code"]).code).toBe(0);
  const before = snapshot(home, [target]);
  const entry = readState(home).installations.find((row) => row.name === "broken")!;
  const healthyEntry = readState(home).installations.find((row) => row.name === "healthy");
  expect(entry.source).toMatchObject({ tap, path: sourcePath });
  expect(entry.tracks_tap).toBe(true);
  const safeTap = "broken-\\x0a\\x1b\\x85";
  const message = `cannot read source \`${parent.slice(0, parent.indexOf("?"))}?token=***`;
  const sourceManifest = join(broken, "SKILL.md");
  chmodSync(sourceManifest, 0o000);
  try {
    for (const args of [["update", "--dry-run"], ["outdated"], ["update"]]) {
      const human = invoke(home, args);
      expect(human.code).toBe(1);
      expect(human.err).toBe("");
      expect(human.out).toContain(`broken (from ${safeTap}) source_unreachable`);
      expect(human.out).toContain(`  ${message}\n`);
      expect(human.out).not.toContain("FIELD_MESSAGE_SECRET");
      expect(human.out).not.toContain("permission denied");
      expect(human.out).not.toContain(tap);
      expect(human.out).not.toContain("\x1b");
      expect(human.out).not.toContain("\x85");
      const json = invoke(home, [...args, "--json"]);
      expect(json.code).toBe(1);
      expect(json.err).toBe("");
      const payload = JSON.parse(json.out) as {
        rows: UpdateRow[];
        tap_reexpand_rows: TapReexpandRow[];
        dry_run: boolean;
      };
      expect(payload.rows).toEqual([
        {
          name: "broken",
          scope: "user",
          outcome: {
            kind: "failed",
            error: {
              code: "source_unreachable",
              message,
              remedy:
                "Check that the source file exists and that you can read it and access its parent directories.",
            },
          },
        },
        { name: "healthy", scope: "user", outcome: { kind: "up_to_date" } },
      ]);
      expect(payload.tap_reexpand_rows).toEqual([
        {
          name: "broken",
          scope: "user",
          tap,
          kind: "tap_error",
          error: {
            code: "source_unreachable",
            message,
            remedy:
              "Check that the source file exists and that you can read it and access its parent directories.",
          },
        },
      ]);
      expect(payload.dry_run).toBe(args.length > 1 || args[0] === "outdated");
      const quiet = invoke(home, [...args, "--quiet"]);
      expect(quiet.code).toBe(1);
      expect(quiet.out).toBe("");
      expect(quiet.err).toContain(
        `broken (from ${safeTap}): failed (source_unreachable): ${message}`,
      );
      expect(quiet.err).not.toContain("FIELD_MESSAGE_SECRET");
      expect(quiet.err).not.toContain("healthy");
      const quietJson = invoke(home, [...args, "--quiet", "--json"]);
      expect(quietJson).toEqual(json);
      const info = invoke(home, ["info", "broken", "--json"]);
      expect(info.code).toBe(0);
      const identity = JSON.parse(info.out) as { installed: StateEntry };
      expect(identity.installed).toEqual(entry);
      expect(identity.installed.source).toMatchObject({ tap, path: sourcePath });
      expect(snapshot(home, [target])).toEqual(before);
    }
  } finally {
    chmodSync(sourceManifest, 0o644);
  }
  writeFileSync(join(broken, "asset.txt"), "retry bytes");
  expect(invoke(home, ["update", "broken"]).code).toBe(0);
  expect(readFileSync(join(target, "broken", "asset.txt"), "utf8")).toBe("retry bytes");
  expect(readState(home).installations.find((row) => row.name === "healthy")).toEqual(healthyEntry);
});
