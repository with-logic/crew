/** Newline-only malformed headers stay within discovery's memory allowance (§9 step 4). */

import { expect, test } from "bun:test";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir } from "../../helpers/fixtures.ts";

// Allow startup and allocator noise while rejecting growth proportional to the 64 MiB input.
const MAX_RSS_GROWTH_BYTES = 32 * 1024 * 1024;

const reader = new URL("../../../src/skill/read-frontmatter.ts", import.meta.url).href;
const child = `
import { readFrontmatter } from ${JSON.stringify(reader)};
let result;
try { result = readFrontmatter(process.argv[1]); }
catch (error) { result = { code: error.code, message: error.message }; }
console.log(JSON.stringify({ result, peakBytes: process.resourceUsage().maxRSS * (process.platform === "darwin" ? 1 : 1024) }));
`;

test("frontmatter discovery bounds memory for a 64 MiB newline-only unclosed header", () => {
  const samples: { result: unknown; peakBytes: number }[] = [];
  for (const fixtureMiB of [0, 64]) {
    const file = join(makeTempDir(), "candidate.md");
    writeFileSync(file, "---\nname: candidate\n");
    const block = "\n".repeat(64 * 1024);
    for (let i = 0; i < fixtureMiB * 16; i++) appendFileSync(file, block);
    const process = Bun.spawnSync([Bun.which("bun")!, "--eval", child, file]);
    expect(process.exitCode).toBe(0);
    expect(process.stderr.toString()).toBe("");
    const sample: unknown = JSON.parse(process.stdout.toString());
    expect(typeof sample).toBe("object");
    expect(sample).not.toBeNull();
    expect(sample).toHaveProperty("result");
    expect(sample).toHaveProperty("peakBytes");
    const payload = sample as { result: unknown; peakBytes: unknown };
    expect(typeof payload.peakBytes).toBe("number");
    expect(Number.isFinite(payload.peakBytes)).toBe(true);
    samples.push({ result: payload.result, peakBytes: payload.peakBytes as number });
  }
  expect(samples[0]!.result).toEqual({
    code: "invalid_skill",
    message: "SKILL.md frontmatter never closes — add a `---` line after the last YAML field",
  });
  expect(samples[1]!.result).toEqual(samples[0]!.result);
  console.info(`64 MiB newline header: ${JSON.stringify(samples)}`);
  expect(samples[1]!.peakBytes - samples[0]!.peakBytes).toBeLessThan(MAX_RSS_GROWTH_BYTES);
});
