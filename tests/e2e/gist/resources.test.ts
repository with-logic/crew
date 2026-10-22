/** Gist discovery preserves the bounded-reader memory contract (§9 step 5). */
import { expect, test } from "bun:test";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir } from "../../helpers/fixtures.ts";

// Allow startup/allocator noise while rejecting growth proportional to the 64 MiB body.
const MAX_DISCOVERY_RSS_GROWTH_BYTES = 32 * 1024 * 1024;

const reader = new URL("../../../src/sources/gist.ts", import.meta.url).href;
const child = `
import { gistCandidates } from ${JSON.stringify(reader)};
const names = gistCandidates(process.argv[1]).map((candidate) => candidate.frontmatter.name);
console.log(JSON.stringify({ names }));
`;
for (const [label, prefix, chunk, fixtureMiB] of [
  ["valid body", "---\nname: candidate\ndescription: candidate\n---\n", "x", 64],
  ["unclosed single header line", "---\nx", "x", 64],
  ["unclosed multiline header", "---\nname: candidate\n", "\n", 8],
] as const) {
  test(`C-GIST-02 candidate discovery bounds memory for a ${fixtureMiB} MiB ${label}`, () => {
    const small = makeTempDir();
    const large = makeTempDir();
    writeFileSync(join(small, "arbitrary.file"), prefix);
    const file = join(large, "arbitrary.file");
    writeFileSync(file, prefix);
    const block = chunk.repeat(64 * 1024);
    for (let i = 0; i < fixtureMiB * 16; i++) appendFileSync(file, block);
    const samples: { names: string[]; peakBytes: number }[] = [];
    for (const path of [small, large]) {
      const result = Bun.spawnSync([Bun.which("bun")!, "--eval", child, path]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr.toString()).toBe("");
      const sample: { names: string[] } = JSON.parse(result.stdout.toString());
      samples.push({ names: sample.names, peakBytes: result.resourceUsage.maxRSS });
    }
    expect(samples[1]!.names).toEqual(samples[0]!.names);
    console.info(`${label}: baseline=${samples[0]!.peakBytes} large=${samples[1]!.peakBytes}`);
    expect(samples[1]!.peakBytes - samples[0]!.peakBytes).toBeLessThan(
      MAX_DISCOVERY_RSS_GROWTH_BYTES,
    );
  });
}
