/** Redirect real adapters and existing subprocess seams for a local §11.2 measurement fixture. */
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { GitRunner } from "../../../src/git/exec.ts";
import { observe } from "./observer.ts";
import type { PublicCli } from "./types.ts";

export async function fixtureEnvironment(
  source: string,
  fixture: string,
  counters: boolean,
): Promise<{
  ALL_AGENTS: typeof import("../../../src/agents/registry.ts")["ALL_AGENTS"];
  runCli: PublicCli;
  schedulerCalls: string[][];
  transportCalls: string[][];
  transportViolations: string[][];
}> {
  process.env["CREW_HOME"] = join(fixture, "crew");
  process.env["CREW_LAUNCH_AGENTS_DIR"] = join(fixture, "scheduler", "launchd");
  process.env["CREW_SYSTEMD_USER_DIR"] = join(fixture, "scheduler", "systemd");
  process.env["CREW_NOW"] = "2026-10-21T12:00:00.000Z";
  process.env["CREW_NO_UPDATE_CHECK"] = "1";
  const load = (path: string): Promise<unknown> => import(pathToFileURL(join(source, path)).href);
  const { ALL_AGENTS } = (await load(
    "src/agents/registry.ts",
  )) as typeof import("../../../src/agents/registry.ts");
  const { runCli } = (await load("src/cli/main.ts")) as typeof import("../../../src/cli/main.ts");
  const { setAutoupdatePlatform } = (await load(
    "src/autoupdate/scheduler.ts",
  )) as typeof import("../../../src/autoupdate/scheduler.ts");
  const { setLaunchctlRunner } = (await load(
    "src/autoupdate/launchctl.ts",
  )) as typeof import("../../../src/autoupdate/launchctl.ts");
  const { setGitRunner } = (await load(
    "src/git/exec.ts",
  )) as typeof import("../../../src/git/exec.ts");
  const transportViolations: string[][] = [];
  const transportCalls: string[][] = [];
  const prior: GitRunner = setGitRunner((args, options) => {
    if (args.some((arg) => ["clone", "fetch", "ls-remote", "push", "pull"].includes(arg))) {
      transportCalls.push([...args]);
      const allowed =
        args.includes("clone") &&
        args.some((arg) => arg === `file://${join(fixture, "offline-core")}`);
      if (!allowed) {
        transportViolations.push([...args]);
        throw new Error("measurement forbids unexpected git transport");
      }
    }
    return prior(args, options);
  });
  setAutoupdatePlatform("darwin");
  const schedulerCalls: string[][] = [];
  setLaunchctlRunner((args: string[]) => {
    schedulerCalls.push([...args]);
    if (counters) observe("scheduler.runner", { args });
    if (args[0] !== "list") throw new Error("healthy baseline must not change the scheduler");
    return false; // Existing boundary seam: a deterministic unloaded scheduler, config disabled.
  });
  const redirectedBases = new Map<string, string>();
  for (const adapter of ALL_AGENTS) {
    const originalUser = adapter.userPath;
    const originalProject = adapter.projectPath;
    // Execute real path methods; map user bases into the owned fixture while preserving path sharing.
    adapter.userPath = () => {
      const original = originalUser.call(adapter);
      let base = redirectedBases.get(original);
      if (base === undefined) {
        base =
          original === ""
            ? ""
            : join(
                fixture,
                "users",
                createHash("sha256").update(original).digest("hex").slice(0, 16),
              );
        redirectedBases.set(original, base);
      }
      if (counters) observe("adapter.user_path", { adapter: adapter.name, base });
      return base;
    };
    adapter.projectPath = (cwd: string) => {
      const base = originalProject.call(adapter, cwd);
      const rel = relative(fixture, base);
      if (base !== "" && (!isAbsolute(base) || rel === ".." || rel.startsWith(`..${sep}`)))
        throw new Error(`project path escaped owned fixture: ${base}`);
      if (counters) observe("adapter.project_path", { adapter: adapter.name, cwd, base });
      return base;
    };
    // Host detection is deliberately fixed, not claimed as measured real detector cost.
    adapter.detect = () => {
      if (counters) observe("adapter.detect_controlled", { adapter: adapter.name });
      return true;
    };
  }
  return { ALL_AGENTS, runCli, schedulerCalls, transportCalls, transportViolations };
}
