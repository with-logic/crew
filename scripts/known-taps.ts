/**
 * Developer CLI for known-tap registry maintenance (§16.2.1).
 */

import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addKnownTapSource } from "../src/known-taps/build/add.ts";
import { buildKnownTapRegistry } from "../src/known-taps/build/index.ts";
import { parseKnownTapManifest } from "../src/known-taps/build/manifest.ts";
import { updateKnownTapPins } from "../src/known-taps/build/pins.ts";
import { renderKnownTapRegistry } from "../src/known-taps/build/render.ts";
import type { KnownTapManifest } from "../src/known-taps/build/types.ts";
import { readText, rmrf, writeText } from "../src/util/fs.ts";
import { readJson, writeJson } from "../src/util/json.ts";
import {
  COMMON_FLAGS,
  ensureFlags,
  flagValue,
  type ParsedArgs,
  type Paths,
  parseArgs,
  pathsFrom,
  trustFlag,
  updateSelection,
  usage,
} from "./known-taps/args.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WORK_DIR = join(ROOT, ".crew-known-taps-work");
const argv = Bun.argv.slice(2);

try {
  withCleanup(argv, () => run(argv));
} catch (err) {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
}

function run(argv: readonly string[]): void {
  const command = argv[0];
  if (command === undefined || command === "help" || command === "--help") {
    throw new Error(usage());
  }
  const parsed = parseArgs(argv.slice(1));
  const paths = pathsFrom(ROOT, DEFAULT_WORK_DIR, parsed);
  assertSafeWorkDir(paths.workDir);
  if (command === "build") {
    build(paths);
    return;
  }
  if (command === "check") {
    check(paths);
    return;
  }
  if (command === "update") {
    update(parsed, paths);
    return;
  }
  if (command === "add") {
    add(parsed, paths);
    return;
  }
  throw new Error(`unknown known-taps command \`${command}\`\n\n${usage()}`);
}

function build(paths: Paths): void {
  const manifest = readManifest(paths.manifestPath);
  writeRegistry(paths.outPath, manifest, paths.workDir);
}

function check(paths: Paths): void {
  const manifest = readManifest(paths.manifestPath);
  const expected = renderRegistry(manifest, paths.workDir);
  const actual = readText(paths.outPath);
  if (actual === expected) {
    return;
  }
  throw new Error(staleMessage(actual, expected));
}

function update(parsed: ParsedArgs, paths: Paths): void {
  ensureFlags(parsed, [...COMMON_FLAGS, "all"]);
  const manifest = readManifest(paths.manifestPath);
  const selection = updateSelection(parsed);
  const updated = updateKnownTapPins(manifest, selection);
  const rendered = renderRegistry(updated.manifest, paths.workDir);
  writeJson(paths.manifestPath, updated.manifest);
  writeText(paths.outPath, rendered);
  printUpdates(updated.updates);
}

function add(parsed: ParsedArgs, paths: Paths): void {
  ensureFlags(parsed, [...COMMON_FLAGS, "description", "subpath", "trust", "tracking-ref"]);
  if (parsed.positionals.length !== 2) {
    throw new Error("usage: bun run known-taps add <name> <url>");
  }
  const manifest = readManifest(paths.manifestPath);
  const result = addKnownTapSource(manifest, {
    name: parsed.positionals[0]!,
    url: parsed.positionals[1]!,
    subpath: flagValue(parsed, "subpath") ?? "",
    description: flagValue(parsed, "description"),
    trust: trustFlag(parsed),
    trackingRef: flagValue(parsed, "tracking-ref") ?? "main",
  });
  const rendered = renderRegistry(result.manifest, paths.workDir);
  writeJson(paths.manifestPath, result.manifest);
  writeText(paths.outPath, rendered);
  process.stdout.write(`added ${result.source.name} at ${result.source.commit.slice(0, 8)}\n`);
}

function readManifest(path: string): KnownTapManifest {
  return parseKnownTapManifest(readJson<unknown>(path));
}

function writeRegistry(outPath: string, manifest: KnownTapManifest, workDir: string): void {
  writeText(outPath, renderRegistry(manifest, workDir));
}

function renderRegistry(manifest: KnownTapManifest, workDir: string): string {
  return renderKnownTapRegistry(buildKnownTapRegistry(manifest, { workDir }));
}

function printUpdates(updates: readonly { name: string; from: string; to: string }[]): void {
  if (updates.length === 0) {
    process.stdout.write("no known taps with trackingRef to update\n");
    return;
  }
  for (const update of updates) {
    process.stdout.write(
      `${update.name}: ${update.from.slice(0, 8)} -> ${update.to.slice(0, 8)}\n`,
    );
  }
}

function withCleanup(argv: readonly string[], fn: () => void): void {
  const cleanupDir = cleanupPathFrom(argv);
  try {
    fn();
  } finally {
    rmrf(cleanupDir);
  }
}

function cleanupPathFrom(argv: readonly string[]): string {
  const parsed = parseArgs(argv.slice(1));
  const workDir = pathsFrom(ROOT, DEFAULT_WORK_DIR, parsed).workDir;
  assertSafeWorkDir(workDir);
  return workDir;
}

function assertSafeWorkDir(workDir: string): void {
  const resolved = resolve(workDir);
  const forbidden = new Set([resolve(ROOT), resolve("/"), resolve(process.env["HOME"] ?? ROOT)]);
  if (forbidden.has(resolved) || !basename(resolved).includes("known-taps-work")) {
    throw new Error("--work-dir must point at a disposable known-taps work directory");
  }
}

function staleMessage(actual: string, expected: string): string {
  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");
  const max = Math.max(actualLines.length, expectedLines.length);
  for (let i = 0; i < max; i++) {
    if (actualLines[i] !== expectedLines[i]) {
      return `known-tap registry is stale at line ${i + 1}; run \`bun run known-taps build\``;
    }
  }
  return "known-tap registry is stale; run `bun run known-taps build`";
}
