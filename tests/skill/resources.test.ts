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

for (const [label, prefix, chunk] of [
  ["valid body", "---\nname: candidate\n---\n", "\n"],
  ["unclosed frontmatter", "---\nname: candidate\n", "\n"],
  ["invalid first line", "x", "x"],
  ["unclosed single header line", "---\nx", "x"],
]) {
  test(`loadSkillName bounds memory for an 8 MiB ${label}`, () => {
    const small = makeTempDir();
    const large = makeTempDir();
    writeFileSync(join(small, "SKILL.md"), prefix!);
    const file = join(large, "SKILL.md");
    writeFileSync(file, prefix!);
    const block = chunk!.repeat(64 * 1024);
    for (let i = 0; i < 128; i++) appendFileSync(file, block);
    const samples: { result: unknown; peakBytes: number }[] = [];
    for (const path of [small, large]) {
      const process = Bun.spawnSync([Bun.which("bun")!, "--eval", child, path]);
      expect(process.exitCode).toBe(0);
      expect(process.stderr.toString()).toBe("");
      samples.push(JSON.parse(process.stdout.toString()));
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
