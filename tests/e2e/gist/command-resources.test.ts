/** Actual gist commands retain metadata rather than all skill bodies (§9, §16.6). */
import { expect, test } from "bun:test";

const fixture = new URL("./helpers.ts", import.meta.url).href;
const agents = new URL("../../../src/agents/registry.ts", import.meta.url).href;
const state = new URL("../../../src/state/load.ts", import.meta.url).href;
const fixtures = new URL("../../helpers/fixtures.ts", import.meta.url).href;
// Ten bodies expose aggregate retention; allow transient hashing/copy buffers and runtime noise.
const MAX_COMMAND_RSS_GROWTH_BYTES = 192 * 1024 * 1024;
const child = `
import { appendFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from ${JSON.stringify(agents)};
import { readState } from ${JSON.stringify(state)};
import { cleanupTempDirs, commitAll, makeTempDir } from ${JSON.stringify(fixtures)};
import { GIST_URL, gistFile, gistFixture } from ${JSON.stringify(fixture)};
// Bun 1.4 normalized macOS SELF maxRSS from native bytes to Node-compatible KiB.
const rssUnit = process.platform === "darwin" && Bun.semver.satisfies(Bun.version, "<1.4.0") ? 1 : 1024;
const f = gistFixture({});
const target = makeTempDir();
for (const adapter of ALL_AGENTS) {
  adapter.userPath = () => target;
  adapter.projectPath = () => target;
  adapter.detect = () => adapter.name === "claude-code";
}
try {
  const block = "x".repeat(64 * 1024);
  for (let i = 0; i < 10; i++) {
    const filename = "file" + i;
    gistFile(f.repo, filename, "skill" + i, i < 9 ? ["skill" + (i + 1)] : []);
    for (let j = 0; j < Number(process.argv[2]) * 16; j++) appendFileSync(join(f.repo, filename), block);
  }
  commitAll(f.repo, "resource fixture");
  const added = f.cli("tap", "add", GIST_URL, "snippets");
  if (added.code !== 0) throw new Error(JSON.stringify(added));
  const command = process.argv[1];
  const result = command === "search" ? f.cli(command, "--tap", "snippets", "--json")
    : f.cli(command, "snippets", "--json");
  if (result.code !== 0) throw new Error(JSON.stringify(result));
  const names = command === "install"
    ? readState(f.home).installations.map((entry) => {
        if (statSync(join(target, entry.name, "SKILL.md")).size !== statSync(join(f.repo, entry.source.path)).size)
          throw new Error("installed body was truncated");
        return entry.name;
      })
    : JSON.parse(result.out)[command === "search" ? "hits" : "skills"].map((skill) => skill.name);
  console.log(JSON.stringify({ names: names.sort(), peakBytes: process.resourceUsage().maxRSS * rssUnit }));
} finally {
  cleanupTempDirs();
}
`;

for (const command of ["install", "search", "info"]) {
  test(`C-GIST-02 ${command} bounds memory across ten 32 MiB skill bodies`, () => {
    const samples: { names: string[]; peakBytes: number }[] = [];
    for (const bodyMiB of [0, 32]) {
      const result = Bun.spawnSync([Bun.which("bun")!, "--eval", child, command, String(bodyMiB)]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr.toString()).toBe("");
      samples.push(JSON.parse(result.stdout.toString()));
    }
    expect(samples[1]!.names).toEqual(Array.from({ length: 10 }, (_, i) => `skill${i}`));
    expect(samples[1]!.names).toEqual(samples[0]!.names);
    console.info(`${command}: baseline=${samples[0]!.peakBytes} large=${samples[1]!.peakBytes}`);
    expect(samples[1]!.peakBytes - samples[0]!.peakBytes).toBeLessThan(
      MAX_COMMAND_RSS_GROWTH_BYTES,
    );
  }, 120_000);
}
