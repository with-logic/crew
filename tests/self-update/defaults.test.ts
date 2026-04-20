/**
 * Tests for the default (unstubbed) subprocess implementations of the
 * release fetcher, asset downloader, and xattr clearer. These modules
 * have seams so most tests don't touch real processes; these tests
 * exist to exercise the default paths by monkey-patching
 * `Bun.spawnSync` — matching the pattern used by
 * `tests/autoupdate/launchd.test.ts`.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { downloadAssetToTemp, installBinary } from "../../src/self-update/download.ts";
import { fetchRelease } from "../../src/self-update/github.ts";
import { makeCrewHome } from "../helpers/env.ts";

/** Simulate a `Bun.spawnSync` result. */
function result(exitCode: number, stdout = "", stderr = "") {
  return {
    exitCode,
    stdout: new TextEncoder().encode(stdout),
    stderr: new TextEncoder().encode(stderr),
    success: exitCode === 0,
    pid: 1234,
    resourceUsage: () => ({}),
    signalCode: null,
  } as unknown as ReturnType<typeof Bun.spawnSync>;
}

const originalSpawnSync = Bun.spawnSync;

afterEach(() => {
  (Bun as unknown as { spawnSync: typeof Bun.spawnSync }).spawnSync = originalSpawnSync;
});

/** Stub Bun.spawnSync with the given handler for this test only. */
function stubSpawnSync(handler: (args: Parameters<typeof Bun.spawnSync>[0]) => unknown): void {
  (Bun as unknown as { spawnSync: typeof Bun.spawnSync }).spawnSync = ((
    args: Parameters<typeof Bun.spawnSync>[0],
  ) => handler(args)) as typeof Bun.spawnSync;
}

describe("defaultFetcher (github.ts)", () => {
  test("parses curl stdout as GitHub JSON", () => {
    stubSpawnSync(() =>
      result(
        0,
        JSON.stringify({
          tag_name: "v0.5.0",
          assets: [{ name: "crew-macos-arm64", browser_download_url: "https://x/arm64" }],
        }),
      ),
    );
    const r = fetchRelease("https://api.github.com/whatever", 5);
    expect(r.tag).toBe("v0.5.0");
    expect(r.assets["crew-macos-arm64"]).toBe("https://x/arm64");
  });

  test("non-zero curl exit raises self_update_unavailable", () => {
    stubSpawnSync(() => result(22, "", "curl: (6) Couldn't resolve host"));
    expect(() => fetchRelease("https://example.com", 5)).toThrow(/couldn't reach the release feed/);
  });

  test("unparseable JSON raises self_update_unavailable", () => {
    stubSpawnSync(() => result(0, "not json"));
    expect(() => fetchRelease("https://example.com", 5)).toThrow(/unparseable JSON/);
  });

  test("missing tag_name raises self_update_unavailable", () => {
    stubSpawnSync(() => result(0, JSON.stringify({ assets: [] })));
    expect(() => fetchRelease("https://example.com", 5)).toThrow(/didn't include a tag_name/);
  });

  test("drops assets that are missing name or url", () => {
    stubSpawnSync(() =>
      result(
        0,
        JSON.stringify({
          tag_name: "v0.1.0",
          assets: [
            { name: "keep-me", browser_download_url: "https://x/keep" },
            { name: "no-url" },
            { browser_download_url: "https://x/no-name" },
          ],
        }),
      ),
    );
    const r = fetchRelease("https://example.com", 5);
    expect(Object.keys(r.assets)).toEqual(["keep-me"]);
  });
});

describe("defaultDownloader (download.ts)", () => {
  test("writes downloaded bytes to the temp path", () => {
    const home = makeCrewHome();
    // Actual curl call: fake it by intercepting spawnSync and writing
    // the file ourselves.
    stubSpawnSync((args) => {
      const cmd = (args as unknown as { cmd: string[] }).cmd;
      const outIdx = cmd.indexOf("-o");
      const outPath = cmd[outIdx + 1]!;
      require("node:fs").writeFileSync(outPath, "downloaded-bytes");
      return result(0);
    });
    const p = downloadAssetToTemp("https://example.com/asset", 5);
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, "utf8")).toBe("downloaded-bytes");
    void home;
  });

  test("non-zero curl exit raises self_update_unavailable", () => {
    stubSpawnSync(() => result(22, "", "HTTP 404"));
    expect(() => downloadAssetToTemp("https://example.com/asset", 5)).toThrow(/HTTP 404/);
  });

  test("empty stderr still produces a useful error message", () => {
    stubSpawnSync(() => result(7));
    expect(() => downloadAssetToTemp("https://example.com/asset", 5)).toThrow(/curl exited with 7/);
  });
});

describe("defaultXattrClearer (download.ts)", () => {
  test("invokes `xattr -dr com.apple.quarantine` on the target path", () => {
    const home = makeCrewHome();
    const src = join(home, "fresh");
    const dest = join(home, "crew");
    require("node:fs").writeFileSync(src, "new");
    require("node:fs").writeFileSync(dest, "old");
    const cmds: string[][] = [];
    stubSpawnSync((args) => {
      const cmd = (args as unknown as { cmd: string[] }).cmd;
      cmds.push(cmd);
      return result(0);
    });
    installBinary(src, dest);
    // We should see exactly one xattr invocation targeting `src`.
    expect(cmds).toEqual([["xattr", "-dr", "com.apple.quarantine", src]]);
  });

  test("swallows a spawn failure (non-macOS)", () => {
    const home = makeCrewHome();
    const src = join(home, "fresh");
    const dest = join(home, "crew");
    require("node:fs").writeFileSync(src, "new");
    require("node:fs").writeFileSync(dest, "old");
    stubSpawnSync(() => {
      throw new Error("ENOENT: xattr not on PATH");
    });
    // Should still complete the install, because xattr errors are
    // non-fatal on platforms that don't have it.
    expect(() => installBinary(src, dest)).not.toThrow();
    expect(readFileSync(dest, "utf8")).toBe("new");
  });
});
