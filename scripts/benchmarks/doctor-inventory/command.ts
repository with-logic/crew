/** Real public runCli setup/measurement worker for PRD §11.2/§14; real local files only. */
import { join, relative, resolve, sep } from "node:path";
import { fixtureEnvironment } from "./environment.ts";
import { measureFixture } from "./measure.ts";
import { setupFixture } from "./setup.ts";
import type { Fixture, Input, Invoke } from "./types.ts";

// The owned Python driver supplies this typed payload; this is not a public CLI input.
const input = JSON.parse(process.argv[2]!) as Input;
const path = resolve(input.fixture);
const rel = relative(resolve(input.runRoot), path);
if (rel === ".." || rel.startsWith(`..${sep}`) || rel === "")
  throw new Error("fixture must be a child of the owned runs directory");
const home = join(path, "crew");
const projectRoots = Array.from({ length: input.roots }, (_, i) => join(path, "projects", `p${i}`));
const cwd = projectRoots[0]!; // The cwd is one of N roots, never an uncounted N+1 root.
const env = await fixtureEnvironment(resolve(input.source), path, input.counters);
const invoke: Invoke = (args, working = cwd) => {
  let stdout = "";
  let stderr = "";
  const code = env.runCli(args, {
    home,
    cwd: working,
    width: 120,
    stderrIsTty: false,
    streams: {
      stdout: (s: string) => {
        stdout += s;
      },
      stderr: (s: string) => {
        stderr += s;
      },
    },
  });
  return { code, stdout, stderr };
};
const fixture: Fixture = {
  input,
  path,
  home,
  projectRoots,
  cwd,
  env,
  invoke,
  stateTarget: join(home, "state.json"),
  coordinationRoot: join(home, "locks"),
};
if (input.action === "setup") {
  setupFixture(fixture);
  process.stdout.write(
    `${JSON.stringify({
      action: "setup",
      roots: projectRoots,
      home,
      transportCalls: env.transportCalls,
    })}\n`,
  );
} else {
  const result = measureFixture(fixture);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.code;
}
