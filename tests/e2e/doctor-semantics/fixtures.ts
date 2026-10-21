/** Real local installs and byte inventories for §11.2/§12.2 semantic marker proofs. */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import type { Marker } from "../../../src/core/types.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

export function invoke(home: string, cwd: string, args: string[]) {
  const cap = captureStreams();
  const code = runCli(args, { home, cwd, streams: cap.streams });
  return { code, text: cap.stdout(), json: () => JSON.parse(cap.stdout()) };
}

export function installed(
  kind: "git" | "path",
  scope: "user" | "project",
  cwd: string,
  target: string,
) {
  const home = makeCrewHome();
  const root = makeTempDir();
  const source = makeSkill(root, "demo", skillFrontmatter({ name: "demo" }));
  let ref = source;
  if (kind === "git") {
    let { sha } = makeGitRepo(source);
    // Ensure uppercase metadata exercises a different spelling of the real store prefix.
    while (!/[a-f]/.test(sha.slice(0, 8))) sha = commitAll(source, "prefix with hex letters");
    ref = `file://${source}`;
  }
  const installation = invoke(home, cwd, [
    "install",
    ref,
    "--agent",
    "claude-code",
    "--scope",
    scope,
  ]);
  const installDir = join(scope === "user" ? target : cwd, "claude-code", "demo");
  const markerPath = join(installDir, ".crew.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8")) as Marker;
  return { home, source, ref, installDir, markerPath, marker, installation };
}

export function bytes(roots: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(path: string): void {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) {
      result[path] = "absent";
    } else if (stat.isSymbolicLink()) {
      result[path] = `link:${readlinkSync(path)}`;
    } else if (stat.isDirectory()) {
      result[path] = "directory";
      for (const name of readdirSync(path).sort()) visit(join(path, name));
    } else {
      result[path] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  }
  for (const root of roots) visit(root);
  return result;
}
