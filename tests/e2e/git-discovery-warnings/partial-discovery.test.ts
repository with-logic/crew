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
  symlinkSync("absent-partial-target", join(projects, "00-link"));
  const denied = join(projects, "zz-denied");
  mkdirSync(denied);
  writeFileSync(join(denied, "keep.txt"), "tracked directory\n");
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
  expect(order).toContain("00-link");
  expect(order).toContain("zz-denied");
  expect(order.indexOf("00-link")).toBeLessThan(order.indexOf("zz-denied"));
  const blocked = join(cloneProjects, "zz-denied");
  chmodSync(blocked, 0);
  try {
    const result = cli(home, ["search", "--json"]);
    const payload = JSON.parse(result.out);
    console.log(JSON.stringify({ order, warnings: payload.warnings }));
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    expect(payload.hits.map((hit: { name: string }) => hit.name)).toEqual(["healthy"]);
    expect(payload.warnings[0]).toContain("source_unreachable");
    expect(payload.warnings[0]).toContain("zz-denied");
    expect(payload.warnings).toHaveLength(2);
    expect(payload.warnings[1]).toBe(WARNING);
  } finally {
    chmodSync(blocked, 0o755);
  }
});
