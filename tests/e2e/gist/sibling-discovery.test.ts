/** Live gist sibling lookup revalidates source changes within a command (§9 step 6). */
import { afterEach, expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { tapClonePath } from "../../../src/core/repo-path.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { findSiblingDep } from "../../../src/install/dep-resolution/index.ts";
import { withGistDiscovery } from "../../../src/sources/gist.ts";
import { GIST_URL, gistFile, gistFixture } from "./helpers.ts";

afterEach(resetGitRunner);

test("C-GIST-05 live fallback discovers new files and propagates later read failures", () => {
  const f = gistFixture();
  expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
  const config = readConfig(f.home);
  const tap = config.taps.find((entry) => entry.name === "snippets")!;
  const root = tapClonePath(tap, f.home);
  const parent = { tap, tapRelativePath: "prd.md" };
  withGistDiscovery(() => {
    expect(findSiblingDep(parent, "added", f.home, config)).toBeNull();
    gistFile(root, "new.anything", "added");
    expect(findSiblingDep(parent, "added", f.home, config)?.tapRelativePath).toBe("new.anything");
    const file = join(root, "new.anything");
    chmodSync(file, 0);
    try {
      expect(() => findSiblingDep(parent, "added", f.home, config)).toThrow("cannot read source");
    } finally {
      chmodSync(file, 0o600);
    }
  });
});
