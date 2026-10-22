/** Earlier recursive link evidence survives a later source-read failure (§9, §16.6). */

import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { tapClonePath } from "../../../src/core/repo-path.ts";
import { commitAll } from "../../helpers/fixtures.ts";
import { cli, freshHome, register, source, WARNING } from "./fixtures.ts";

test("C-TAP-08g recursive discovery retains a link warning before a later unreadable directory", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const affected = source("recursive", "unavailable", false);
  const projects = join(affected.repo, "projects");
  const branches = ["branch-one", "branch-two"];
  for (const name of branches) {
    const branch = join(projects, name);
    mkdirSync(branch);
    symlinkSync("absent-partial-target", join(branch, "excluded-link"));
    const descendant = join(branch, "blocked");
    mkdirSync(descendant);
    writeFileSync(join(descendant, "keep.txt"), "tracked directory\n");
  }
  commitAll(affected.repo, "link before an unreadable recursive descendant");
  const registered = register(home, affected.repo, "recursive", "affected");
  expect(registered.code).toBe(0);
  expect(registered.err).toBe("");
  const healthy = source("flat", "healthy", false);
  const registeredHealthy = register(home, healthy.repo, "flat", "healthy");
  expect(registeredHealthy.code).toBe(0);
  expect(registeredHealthy.err).toBe("");

  const tap = readConfig(home).taps.find((entry) => entry.name === "affected")!;
  const cloneProjects = join(tapClonePath(tap, home), "projects");
  const order = readdirSync(cloneProjects);
  const branchOrder = order.filter((name) => branches.includes(name));
  expect(branchOrder).toHaveLength(2);
  const [later, earlier] = [branchOrder[0]!, branchOrder[1]!];
  expect(readdirSync(join(cloneProjects, earlier))).toContain("excluded-link");
  expect(order.indexOf(later)).toBeLessThan(order.indexOf(earlier));
  // The walker pops directories last-in-first-out; fail in the branch visited second.
  const blocked = join(cloneProjects, later, "blocked");
  chmodSync(blocked, 0);
  try {
    const result = cli(home, ["search", "--json"]);
    const payload = JSON.parse(result.out);
    console.log(JSON.stringify({ order, warnings: payload.warnings }));
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    expect(payload.hits.map((hit: { name: string }) => hit.name)).toEqual(["healthy"]);
    expect(payload.warnings[0]).toContain("source_unreachable");
    expect(payload.warnings[0]).toContain(later);
    expect(payload.warnings).toHaveLength(2);
    expect(payload.warnings[1]).toBe(WARNING);
  } finally {
    chmodSync(blocked, 0o755);
  }
});
