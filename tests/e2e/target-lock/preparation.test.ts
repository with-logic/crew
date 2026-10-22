/** Missing install-base preparation failures retain ordinary per-target outcomes (§9, §14). */
import { expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { cli, fixture, marker } from "./helpers.ts";

test("C-CONC-07 an absent base creation failure preserves success at another base", async () => {
  const f = fixture();
  const parent = makeTempDir("crew-target-readonly-");
  const missing = join(parent, "missing");
  chmodSync(parent, 0o555);
  try {
    const result = await cli({
      ...f,
      bases: { "claude-code": f.target, codex: missing },
      args: ["install", f.source, "--agent", "claude-code", "--agent", "codex"],
    }).result;
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).records[0].agents).toEqual([
      { kind: "installed", agent: "claude-code" },
      { kind: "failed", agent: "codex", error: expect.objectContaining({ code: "EACCES" }) },
    ]);
    expect(marker(f.target).agents).toEqual(["claude-code"]);
    expect(existsSync(missing)).toBe(false);
    expect(
      JSON.parse(readFileSync(join(f.home, "state.json"), "utf8")).installations[0].agents,
    ).toEqual(["claude-code"]);
  } finally {
    chmodSync(parent, 0o755);
  }
});
