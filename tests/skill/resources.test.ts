/** Name-only discovery keeps bodies and malformed candidates out of memory (§9 step 4). */

import { expect, test } from "bun:test";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir } from "../helpers/fixtures.ts";

const reader = new URL("../../src/skill/load.ts", import.meta.url).href;
const child = `
import { loadSkillName } from ${JSON.stringify(reader)};
let result;
try { result = loadSkillName(process.argv[1]); }
catch (error) { result = { code: error.code, message: error.message }; }
console.log(JSON.stringify({ result, peakBytes: process.resourceUsage().maxRSS * (process.platform === "darwin" ? 1 : 1024) }));
`;
const extraMemoryBytes = 32 * 1024 * 1024;

for (const [label, prefix, chunk, fixtureMiB] of [
  ["valid body", "---\nname: candidate\n---\n", "\n", 8],
  ["single-line valid body", "---\nname: candidate\n---\n", "x", 64],
  ["unclosed frontmatter", "---\nname: candidate\n", "\n", 8],
  ["invalid first line", "x", "x", 64],
  ["unclosed single header line", "---\nx", "x", 64],
] as const) {
  test(`loadSkillName bounds memory for a ${fixtureMiB} MiB ${label}`, () => {
    const small = makeTempDir();
    const large = makeTempDir();
    writeFileSync(join(small, "SKILL.md"), prefix!);
    const file = join(large, "SKILL.md");
    writeFileSync(file, prefix!);
    const block = chunk.repeat(64 * 1024);
    for (let i = 0; i < (fixtureMiB * 1024 * 1024) / block.length; i++) appendFileSync(file, block);
    const samples: { result: unknown; peakBytes: number }[] = [];
    for (const path of [small, large]) {
      const process = Bun.spawnSync([Bun.which("bun")!, "--eval", child, path]);
      expect(process.exitCode).toBe(0);
      expect(process.stderr.toString()).toBe("");
      const sample: unknown = JSON.parse(process.stdout.toString());
      expect(sample).toHaveProperty("result");
      expect(sample).toHaveProperty("peakBytes", expect.any(Number));
      samples.push(sample as { result: unknown; peakBytes: number });
    }
    const baseline = samples[0]!;
    const candidate = samples[1]!;
    expect(candidate.result).toEqual(baseline.result);
    console.info(
      `${label}: baseline=${baseline.peakBytes} bytes large=${candidate.peakBytes} bytes`,
    );
    expect(candidate.peakBytes - baseline.peakBytes).toBeLessThan(extraMemoryBytes);
  });
}
