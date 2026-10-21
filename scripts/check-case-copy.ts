/** Real case-folded copy regression on macOS; implements PRD §12.1. */
import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CrewError } from "../src/core/errors.ts";
import { copyTree } from "../src/util/copy.ts";

const root = mkdtempSync(join(tmpdir(), "crew-case-copy-"));
const image = join(root, "source.sparseimage");
const mount = join(root, "source");
let attached = false;

function hdiutil(...args: string[]): void {
  const result = spawnSync("hdiutil", args, { encoding: "utf8" });
  strictEqual(result.status, 0, `${result.error ?? ""}\n${result.stdout}${result.stderr}`);
}

try {
  mkdirSync(mount);
  hdiutil(
    "create",
    "-size",
    "32m",
    "-fs",
    "Case-sensitive HFS+",
    "-volname",
    "crew-copy",
    "-type",
    "SPARSE",
    image,
  );
  hdiutil("attach", "-nobrowse", "-mountpoint", mount, image);
  attached = true;
  const probe = join(root, "CASE-PROBE");
  writeFileSync(probe, "case-insensitive destination");
  strictEqual(readFileSync(join(root, "case-probe"), "utf8"), "case-insensitive destination");

  for (const kind of ["file", "directory"] as const) {
    const source = join(mount, kind);
    const outside = join(root, `${kind}-outside`);
    const destination = join(root, `${kind}-destination`);
    mkdirSync(source);
    mkdirSync(outside);
    const sentinel = join(outside, "payload");
    writeFileSync(sentinel, "keep outside bytes");
    symlinkSync(kind === "file" ? sentinel : outside, join(source, "B"));
    if (kind === "directory") {
      mkdirSync(join(source, "b"));
      writeFileSync(join(source, "b", "payload"), "replacement");
    } else {
      writeFileSync(join(source, "b"), "replacement");
    }
    deepStrictEqual(readdirSync(source), ["B", "b"]);
    throws(
      () => copyTree(source, destination),
      (error: unknown) => error instanceof CrewError && error.code === "usage_error",
    );
    strictEqual(readFileSync(sentinel, "utf8"), "keep outside bytes");
    strictEqual(existsSync(join(destination, "B")), true);
  }
} finally {
  // Never recursively remove the fixture root while its source image is mounted.
  if (attached) hdiutil("detach", mount);
  rmSync(root, { recursive: true, force: true });
}
