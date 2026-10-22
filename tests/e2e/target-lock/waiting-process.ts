/** Same-process waiting contenders expose their acquired lower lock by PID (§14). */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
export function waitingCli(input: {
  home: string;
  cwd: string;
  target: string;
  args: readonly string[];
  bases?: Readonly<Record<string, string>>;
  barrier?: string;
}) {
  const script = `
import {existsSync,writeFileSync} from "node:fs";
import {runCli} from ${JSON.stringify(join(root, "src/cli/main.ts"))};
import {ALL_AGENTS} from ${JSON.stringify(join(root, "src/agents/registry.ts"))};
import {installNetworkTripwire,takeRemoteGitFailure} from ${JSON.stringify(join(root, "tests/helpers/no-network.ts"))};
installNetworkTripwire();const input=${JSON.stringify(input)};
for(const a of ALL_AGENTS){a.detect=()=>true;a.userPath=()=>input.bases?.[a.name]??input.target;a.projectPath=a.userPath;}
let paused=false;
process.exitCode=runCli([...input.args,"--json","--verbose"],{home:input.home,cwd:input.cwd,streams:{
 stdout:text=>process.stdout.write(text),stderr:text=>{
 process.stderr.write(text);
 if(input.barrier&&!paused&&text.startsWith("crew: installing ")){
  paused=true;writeFileSync(input.barrier,String(process.pid));const deadline=Date.now()+8000;
  while(!existsSync(input.barrier+".release")){if(Date.now()>deadline)throw new Error("owned barrier expired");Bun.sleepSync(10);}
 }
}}});const violation=takeRemoteGitFailure();if(violation)throw new Error(violation);`;
  const child = Bun.spawn([process.execPath, "-e", script], {
    cwd: root,
    env: { ...process.env, CREW_LOCK_TIMEOUT_MS: "5000" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const watchdog = setTimeout(child.kill.bind(child, "SIGKILL"), 10_000);
  const result = child.exited.then(async (exitCode) => {
    clearTimeout(watchdog);
    const [stdout, stderr] = await output;
    return { exitCode, stdout, stderr };
  });
  return { pid: child.pid, result };
}

export async function acquiredBy(base: string, pid: number): Promise<boolean> {
  const owner = join(base, ".crew-target.lock.owner");
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (existsSync(owner) && Number(readFileSync(owner, "utf8").split(" ")[0]) === pid) return true;
    await Bun.sleep(10);
  }
  return false;
}

export function letPublish(barrier: string): void {
  writeFileSync(`${barrier}.release`, "");
}
