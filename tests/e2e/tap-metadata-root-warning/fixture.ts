/** Real CLI fixture for retained-root metadata diagnostics (§9, §11.1, §16.3). */
import { expect } from "bun:test";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

export const WARNING =
  "warning: Some recorded project roots are unusable for tap metadata updates. Run crew doctor to inspect them.\n";

export function withFixture(
  relevant: boolean,
  check: (fixture: ReturnType<typeof prepare>) => void,
): void {
  const root = makeTempDir("crew-metadata-warning-");
  const cwd = join(root, "cwd");
  const retained = join(root, "retained");
  mkdirSync(cwd);
  mkdirSync(retained);
  const seenRoots: string[] = [];
  const locations = new Map([
    [cwd, "cwd"],
    [retained, "retained"],
  ]);
  const originals = ALL_AGENTS.map((adapter) => ({
    adapter,
    userPath: adapter.userPath,
    projectPath: adapter.projectPath,
    detect: adapter.detect,
  }));
  try {
    for (const adapter of ALL_AGENTS) {
      adapter.userPath = () => join(root, "user", adapter.name);
      adapter.projectPath = (location) => {
        seenRoots.push(location);
        return join(root, "project", locations.get(location) ?? "rejected", adapter.name);
      };
      adapter.detect = () => adapter.name === "claude-code";
    }
    check(prepare(root, cwd, retained, seenRoots, relevant));
  } finally {
    for (const { adapter, userPath, projectPath, detect } of originals)
      Object.assign(adapter, { userPath, projectPath, detect });
  }
}

function prepare(
  root: string,
  cwd: string,
  retained: string,
  seenRoots: string[],
  relevant: boolean,
) {
  const home = makeCrewHome();
  const sources = [join(root, "source-a"), join(root, "source-b")];
  const names = ["alpha", "beta"];
  for (const [i, name] of names.entries()) makeSkill(sources[i]!, name, skillFrontmatter({ name }));
  writeConfig(
    {
      ...readConfig(home),
      taps: sources.map((path, i) => ({
        name: i === 0 ? "tap-a" : "tap-b",
        kind: "path",
        registered: true,
        path,
        url: "",
        subpath: "",
      })),
    },
    home,
  );
  const run = (args: readonly string[]) => {
    const capture = captureStreams();
    const code = runCli(args, { home, cwd, streams: capture.streams });
    return { code, stdout: capture.stdout(), stderr: capture.stderr() };
  };
  // biome-ignore lint/suspicious/noMisplacedAssertion: Invoked only within the enclosing test.
  expect(run(["install", "tap-a/alpha", "tap-b/beta"]).code).toBe(0);
  const state = readState(home);
  const original = state.installations.find((entry) => entry.name === "alpha")!;
  const userMarker = join(root, "user", "claude-code", "alpha", ".crew.json");
  const marker = JSON.parse(readFileSync(userMarker, "utf8"));
  const markers = [userMarker];
  for (const location of ["cwd", "retained", "rejected"]) {
    const dest = join(root, "project", location, "claude-code", "alpha");
    mkdirSync(dest, { recursive: true });
    cpSync(join(root, "user", "claude-code", "alpha"), dest, { recursive: true });
    const path = join(dest, ".crew.json");
    writeFileSync(path, JSON.stringify({ ...marker, scope: "project" }));
    markers.push(path);
  }
  const roots = [undefined, null, "", "relative\n\u001b[31mhttps://host/?token=secret", 42];
  const corrupt = roots.map((project_root, i) => ({
    ...original,
    name: `corrupt-${i}`,
    scope: "project",
    source: { ...original.source, tap: relevant ? "tap-a" : "tap-b" },
    ...(project_root === undefined ? {} : { project_root }),
  }));
  // The unrelated state's usable root still exposes an authoritative tap-a marker.
  const inventory = {
    ...original,
    scope: "project",
    project_root: retained,
    source: { ...original.source, tap: "tap-b" },
  };
  const stray = { ...original, name: "stray-user", project_root: "relative" };
  const installations = [...state.installations, inventory, stray, ...corrupt];
  writeFileSync(join(home, "state.json"), JSON.stringify({ ...state, installations }));
  const rejectedBytes = readFileSync(markers[3]!);
  const assertLocations = (tapName: string, recursive: boolean) => {
    for (const path of markers.slice(0, 3)) {
      const actual = JSON.parse(readFileSync(path, "utf8"));
      // biome-ignore lint/suspicious/noMisplacedAssertion: Shared CLI preservation assertion invoked by tests.
      expect(actual.tap_name).toBe(tapName);
      // biome-ignore lint/suspicious/noMisplacedAssertion: Shared CLI preservation assertion invoked by tests.
      expect(actual.tap_discovery).toBe(recursive ? "recursive" : undefined);
    }
    // biome-ignore lint/suspicious/noMisplacedAssertion: Shared CLI preservation assertion invoked by tests.
    expect(readFileSync(markers[3]!)).toEqual(rejectedBytes);
    // biome-ignore lint/suspicious/noMisplacedAssertion: Shared CLI preservation assertion invoked by tests.
    expect(seenRoots.every((location) => location === cwd || location === retained)).toBe(true);
  };
  const snapshot = () => [
    readFileSync(join(home, "config.yaml"), "utf8"),
    readFileSync(join(home, "state.json"), "utf8"),
    ...markers.map((path) => readFileSync(path, "utf8")),
  ];
  seenRoots.length = 0;
  return {
    home,
    sources,
    run,
    corrupt,
    markers,
    snapshot,
    assertLocations,
    betaMarker: () =>
      JSON.parse(readFileSync(join(root, "user", "claude-code", "beta", ".crew.json"), "utf8")),
  };
}
