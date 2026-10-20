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
import { rmrf } from "../src/util/fs.ts";
import { readJson } from "../src/util/json.ts";
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
import { writeKnownTapManifest } from "./known-taps/manifest.ts";
import { checkRegistryFiles, writeRegistryFiles } from "./known-taps/registry.ts";
import { checkSiteCatalog, writeSiteCatalog } from "./known-taps/site-catalog.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WORK_DIR = join(ROOT, ".crew-known-taps-work");
const argv = Bun.argv.slice(2);

try {
  const invocation = invocationFrom(argv);
  withCleanup(invocation, () => run(invocation));
} catch (err) {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
}

interface Invocation {
  readonly command: string | undefined;
  readonly parsed: ParsedArgs;
  readonly paths: Paths;
}

function invocationFrom(argv: readonly string[]): Invocation {
  const parsed = parseArgs(argv.slice(1));
  const paths = pathsFrom(ROOT, DEFAULT_WORK_DIR, parsed);
  assertSafeWorkDir(paths.workDir);
  return { command: argv[0], parsed, paths };
}

function run(invocation: Invocation): void {
  const { command, parsed, paths } = invocation;
  if (command === undefined || command === "help" || command === "--help") {
    throw new Error(usage());
  }
  if (command === "build") {
    ensureFlags(parsed, COMMON_FLAGS);
    build(paths);
    return;
  }
  if (command === "check") {
    ensureFlags(parsed, COMMON_FLAGS);
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
  writeGenerated(paths, manifest);
}

function check(paths: Paths): void {
  const manifest = readManifest(paths.manifestPath);
  const registry = buildKnownTapRegistry(manifest, { workDir: paths.workDir });
  checkRegistryFiles(paths.outPath, renderKnownTapRegistry(registry));
  checkSiteCatalog(paths.siteCatalogPath, registry, paths.workDir);
}

function update(parsed: ParsedArgs, paths: Paths): void {
  ensureFlags(parsed, [...COMMON_FLAGS, "all"]);
  const manifest = readManifest(paths.manifestPath);
  const selection = updateSelection(parsed);
  const updated = updateKnownTapPins(manifest, selection);
  writeKnownTapManifest(paths.manifestPath, updated.manifest);
  writeGenerated(paths, updated.manifest);
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
  writeKnownTapManifest(paths.manifestPath, result.manifest);
  writeGenerated(paths, result.manifest);
  process.stdout.write(`added ${result.source.name} at ${result.source.commit.slice(0, 8)}\n`);
}

function readManifest(path: string): KnownTapManifest {
  return parseKnownTapManifest(readJson<unknown>(path));
}

function writeGenerated(paths: Paths, manifest: KnownTapManifest): void {
  const registry = buildKnownTapRegistry(manifest, { workDir: paths.workDir });
  writeRegistryFiles(paths.outPath, renderKnownTapRegistry(registry));
  writeSiteCatalog(paths.siteCatalogPath, registry, paths.workDir);
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

function withCleanup(invocation: Invocation, fn: () => void): void {
  try {
    fn();
  } finally {
    rmrf(invocation.paths.workDir);
  }
}

function assertSafeWorkDir(workDir: string): void {
  const resolved = resolve(workDir);
  const forbidden = new Set([resolve(ROOT), resolve("/"), resolve(process.env["HOME"] ?? ROOT)]);
  if (forbidden.has(resolved) || !basename(resolved).startsWith(".crew-known-taps-work")) {
    throw new Error("--work-dir must point at a disposable known-taps work directory");
  }
}
