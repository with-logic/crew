/** Test fixture lifecycle for real filesystem isolation (PRD §18). */
import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FIXTURE_TIMEOUT_MS, makeTempDir } from "./fixtures.ts";

for (const fail of [false, true]) {
  describe(`fixture cleanup after ${fail ? "failing" : "passing"} tests`, () => {
    test(
      "removes only this runner's fixtures, including read-only trees",
      () => {
        const root = makeTempDir();
        const childTmp = join(root, "tmp");
        mkdirSync(childTmp);
        mkdirSync(join(childTmp, "crew-unowned"), { mode: 0o500 });
        writeFileSync(join(root, "package.json"), '{"private":true,"type":"module"}\n');
        const config = join(root, "bunfig.toml");
        writeFileSync(
          config,
          `[test]\ncoverage = false\npreload = [${JSON.stringify(resolve("tests/helpers/preload.ts"))}]\n`,
        );
        const child = join(root, "lifecycle.test.ts");
        writeFileSync(
          child,
          `import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir } from ${JSON.stringify(resolve("tests/helpers/fixtures.ts"))};
import { makeCrewHome } from ${JSON.stringify(resolve("tests/helpers/env.ts"))};
const shared = makeTempDir("custom-prefix-");
test("create fixtures", () => {
  const home = makeCrewHome();
  writeFileSync(join(home, "owned"), "fixture");
  const locked = join(shared, "locked");
  mkdirSync(locked);
  writeFileSync(join(locked, "file"), "fixture");
  symlinkSync(${JSON.stringify(join(childTmp, "crew-unowned"))}, join(shared, "outside"));
  chmodSync(locked, 0o500);
  expect(existsSync(shared)).toBe(true);
});
test("module fixtures remain usable across tests", () => {
  expect(existsSync(shared)).toBe(true);
  expect(${fail}).toBe(false);
});
`,
        );
        const result = Bun.spawnSync(
          [process.execPath, "test", `--config=${config}`, "./lifecycle.test.ts"],
          {
            cwd: root,
            env: { ...process.env, TMPDIR: childTmp },
          },
        );
        expect(result.exitCode).toBe(fail ? 1 : 0);
        expect(result.stderr.toString()).toContain("module fixtures remain usable across tests");
        expect(readdirSync(childTmp)).toEqual(["crew-unowned"]);
        expect(statSync(join(childTmp, "crew-unowned")).mode & 0o777).toBe(0o500);
      },
      FIXTURE_TIMEOUT_MS,
    );
  });
}
