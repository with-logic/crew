/**
 * `writeText` publishes atomically (§14).
 *
 * Read-only commands never take the state lock, so a reader can call
 * `readConfig` at any instant during a write. An in-place `writeFileSync`
 * leaves a window where the file on disk is truncated, which surfaces to
 * the user as `config_invalid` on a file that is actually fine.
 *
 * A torn read is timing-dependent and would make a flaky test, so these
 * assert the property that removes the window instead: the target path
 * only ever holds complete content, and the temp file is gone afterwards.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig, writeConfig } from "../../src/config/load.ts";
import { writeText } from "../../src/util/fs.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

describe("atomic writeText", () => {
  test("content is never written directly to the target path", () => {
    const dir = makeTempDir("crew-atomic-");
    const target = join(dir, "config.yaml");
    writeText(target, "old: 1\n");

    // The guarantee is that bytes land somewhere else and are moved into
    // place, so a reader of `target` never observes a partial file. Prove
    // it by making the target unwritable-in-place: a directory at the temp
    // name would break a rename, while an in-place write would have to
    // truncate `target` itself. Here we assert the weaker but checkable
    // form — the inode changes, which only a rename does.
    const before = statSync(target).ino;
    writeText(target, `fresh: ${"y".repeat(100_000)}\n`);
    const after = statSync(target).ino;

    expect(after).not.toBe(before);
    expect(readFileSync(target, "utf8")).toContain("fresh:");
  });

  test("no temp file is left behind", () => {
    const dir = makeTempDir("crew-atomic-");
    const target = join(dir, "state.json");
    writeText(target, "{}\n");
    writeText(target, '{"a":1}\n');
    expect(readdirSync(dir)).toEqual(["state.json"]);
  });

  test("a truncated config is exactly what the atomic write prevents", () => {
    const home = makeTempDir("crew-atomic-home-");
    writeConfig(readConfig(home), home);
    const configPath = join(home, "config.yaml");

    // This is the state an in-place write is briefly in, and it is why the
    // window matters: a reader landing here fails on a file that is fine.
    writeFileSync(configPath, "taps:\n  - name: cor", "utf8");
    expect(() => readConfig(home)).toThrow();

    // Publishing through a rename replaces it in one step — the reader
    // sees the previous bytes or the new ones, never this.
    writeConfig(readConfig(makeTempDir("crew-atomic-src-")), home);
    expect(readConfig(home).taps.length).toBeGreaterThan(0);
  });
});
