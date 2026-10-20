/**
 * The lines `crew install` prints for an entry whose tap or tracking it
 * changed (§5.4, §5.2; C-INST-13o) escape tap names: one hand-edited into
 * `config.yaml` may hold control characters, and none may move the cursor
 * or forge a line.
 */

import { expect, test } from "bun:test";
import { changeLines } from "../../src/commands/install/render/changes.ts";
import { makeStyler } from "../../src/util/term.ts";

const EVIL = "evil\x1b[2J\nforged";
const SHOWN = "evil\\x1b[2J\\x0aforged";

test("C-INST-13o a move and a tracking change name their taps escaped", () => {
  const style = makeStyler(false);
  const moved = changeLines(
    [{ name: "a", scope: "user", tap: EVIL, moved_from: EVIL, tracks_tap: true }],
    "a",
    false,
    style,
  );
  expect(moved).toEqual([
    `    moved from ${SHOWN} to ${SHOWN}`,
    `    now tracks ${SHOWN}: updates install its new skills`,
  ]);
  const stopped = changeLines(
    [{ name: "a", scope: "user", tap: EVIL, tracks_tap: false }],
    "a",
    true,
    style,
  );
  expect(stopped).toEqual([
    `    would stop tracking ${SHOWN}: updates won't install its new skills`,
  ]);
});
