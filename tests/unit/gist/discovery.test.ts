/** Gist candidate metadata supports complete headers and source diagnostics (§9 step 5). */
import { expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gistCandidates, isGistTap, withGistDiscovery } from "../../../src/sources/gist.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

test("C-GIST-02 complete valid headers have no arbitrary size limit", () => {
  const root = makeTempDir();
  const file = join(root, "arbitrary");
  writeFileSync(
    file,
    `---\nname: complete\ndescription: complete\nextra: ${"x".repeat(2 * 1024 * 1024)}\n---\nbody`,
  );
  expect(gistCandidates(root).map((c) => c.frontmatter.name)).toEqual(["complete"]);
});
test("C-GIST-02 cached discovery follows changed source bytes and never retains ownership across commands", () => {
  const root = makeTempDir();
  const file = join(root, "arbitrary");
  const write = (name: string) =>
    writeFileSync(file, `---\nname: ${name}\ndescription: test\n---\n`);
  write("first");
  withGistDiscovery(() => {
    expect(gistCandidates(root)[0]!.frontmatter.name).toBe("first");
    expect(gistCandidates(root)[0]!.frontmatter.name).toBe("first");
    write("second-longer");
    expect(gistCandidates(root)[0]!.frontmatter.name).toBe("second-longer");
  });
  write("last");
  withGistDiscovery(() => expect(gistCandidates(root)[0]!.frontmatter.name).toBe("last"));
});
test("C-GIST-02 unreadable candidates are operational failures, not invalid manifests", () => {
  const root = makeTempDir();
  const file = join(root, "unreadable");
  writeFileSync(file, "---\nname: hidden\ndescription: hidden\n---\n");
  chmodSync(file, 0);
  try {
    expect(() => gistCandidates(root)).toThrow("cannot read source");
  } finally {
    chmodSync(file, 0o600);
  }
});
test("C-GIST-03 layout selection matches the exact owning host", () => {
  const tap = {
    name: "tap",
    kind: "git" as const,
    registered: true,
    url: "https://gist.github.com/owner/id",
    subpath: "",
    path: "",
  };
  expect(isGistTap(tap)).toBe(true);
  expect(isGistTap({ ...tap, url: "https://gist.github.com.evil/owner/id" })).toBe(false);
  expect(isGistTap({ ...tap, url: "file:///tmp/gist.github.com/repo" })).toBe(false);
  expect(isGistTap({ ...tap, kind: "path" })).toBe(false);
});
