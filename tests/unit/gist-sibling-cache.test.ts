/** Gist sibling lookup indexes declared names once per materialized root (§9 step 6). */

import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config, TapConfig } from "../../src/core/types.ts";
import { findSiblingDep, type GistSiblingCache } from "../../src/install/dep-resolution.ts";
import { makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

test("C-GIST-06 cached declared names serve different parents and preserve duplicate matches", () => {
  const root = makeTempDir("crew-sibling-index-");
  const bytes = `---\n${skillFrontmatter({ name: "dep" })}\n---\noriginal\n`;
  writeFileSync(join(root, "one"), bytes);
  writeFileSync(join(root, "two"), bytes);
  writeFileSync(join(root, "unique"), bytes.replace("name: dep", "name: unique"));
  const tap: TapConfig = {
    name: "snippets",
    kind: "git",
    url: "https://gist.github.com/crew-test/0123456789abcdef",
    subpath: "",
    path: "",
    registered: true,
  };
  const config: Config = {
    taps: [tap],
    disabled_agents: [],
    forced_agents: [],
    autoupdate: { enabled: false, interval_seconds: 3600 },
  };
  const cache: GistSiblingCache = new Map();
  const lookup = (parent: string, name: string) =>
    findSiblingDep(
      { tap, tapRelativePath: parent, parentDir: join(root, parent) },
      name,
      "/unused",
      config,
      cache,
    );
  const first = lookup("parent-one", "unique");
  expect(first?.loaded.frontmatter.name).toBe("unique");
  writeFileSync(join(root, "unique"), "invalid after initial scan");
  // A second parent reads the captured index rather than loading the files again.
  expect(lookup("parent-two", "unique")?.loaded).toBe(first?.loaded);
  expect(lookup("parent-three", "missing")).toBeNull();
  expect(() => lookup("parent-four", "dep")).toThrow(/appears multiple times/);
  expect(cache.size).toBe(1);
});
