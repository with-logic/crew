/** Real CLI subprocesses, redirected adapter bases and bounded progress barriers (§14). */
import { expect } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const root = resolve(import.meta.dir, "../../..");
export interface ChildInput {
  readonly home: string;
  readonly target: string;
  readonly cwd: string;
  readonly args: readonly string[];
  readonly bases?: Readonly<Record<string, string>>;
  readonly barrier?: string;
  readonly pause?: string;
  readonly hold?: boolean;
  readonly removeStaged?: string;
}
export function cli(input: ChildInput) {
  const script = `
import {existsSync,writeFileSync,readdirSync,rmSync} from "node:fs";
import {join} from "node:path";
import {runCli} from ${JSON.stringify(join(root, "src/cli/main.ts"))};
import {ALL_AGENTS} from ${JSON.stringify(join(root, "src/agents/registry.ts"))};
import {acquireLock} from ${JSON.stringify(join(root, "src/util/advisory-lock.ts"))};
import {installNetworkTripwire,takeRemoteGitFailure} from ${JSON.stringify(join(root, "tests/helpers/no-network.ts"))};
installNetworkTripwire();
const input=${JSON.stringify(input)};
for(const agent of ALL_AGENTS){
 agent.detect=()=>true;
 agent.userPath=()=>input.bases?.[agent.name]??input.target;
 agent.projectPath=()=>input.bases?.[agent.name]??input.target;
}
function pause(){
 writeFileSync(input.barrier,JSON.stringify({pid:process.pid,home:input.home,target:input.target}));
 const deadline=Date.now()+8000;
 while(!existsSync(input.barrier+".release")){
  if(Date.now()>deadline)throw new Error("owned child barrier timed out");
  Bun.sleepSync(10);
 }
}
let paused=false;
if(input.hold){
 const held=acquireLock(join(input.target,".crew-target"));
 try{pause();}finally{held.release();}
}else{
 const code=runCli([...input.args,"--json","--verbose"],{
  home:input.home,cwd:input.cwd,
  streams:{stdout:text=>process.stdout.write(text),stderr:text=>{
   process.stderr.write(text);
   if(input.barrier&&!paused&&text.startsWith(input.pause)){
    paused=true;pause();
    if(input.removeStaged){
     for(const name of readdirSync(join(input.home,"store")))
      if(name.startsWith(input.removeStaged+"@"))rmSync(join(input.home,"store",name),{recursive:true});
    }
   }
  }}
 });
 process.exitCode=code;
}
const violation=takeRemoteGitFailure();
if(violation)throw new Error(violation);
`;
  const child = Bun.spawn([process.execPath, "-e", script], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CREW_HOME: input.home, CREW_LOCK_TIMEOUT_MS: "100" },
  });
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const watchdog = setTimeout(child.kill.bind(child, "SIGTERM"), 10_000);
  const result = child.exited.then(async (exitCode) => {
    clearTimeout(watchdog);
    const [stdout, stderr] = await output;
    return { exitCode, stdout, stderr };
  });
  return { result, pid: child.pid };
}
export async function ready(barrier: string) {
  const deadline = Date.now() + 4000;
  while (!existsSync(barrier) && Date.now() < deadline) await Bun.sleep(10);
  // biome-ignore lint/suspicious/noMisplacedAssertion: Shared process-barrier assertion.
  expect(existsSync(barrier)).toBe(true);
}
export function release(child: ReturnType<typeof cli>, barrier: string) {
  writeFileSync(`${barrier}.release`, "");
  return child.result;
}
export function fixture() {
  const home = makeCrewHome();
  const cwd = makeTempDir("crew-target-project-");
  const target = makeTempDir("crew-target-base-");
  const sourceRoot = makeTempDir("crew-target-source-");
  const source = makeSkill(sourceRoot, "demo", skillFrontmatter({ name: "demo" }), "initial bytes");
  return { home, cwd, target, source, sourceRoot };
}
export function marker(target: string, name = "demo") {
  return JSON.parse(readFileSync(join(target, name, ".crew.json"), "utf8"));
}
export function expectLocked(result: Awaited<ReturnType<typeof cli>["result"]>) {
  // biome-ignore lint/suspicious/noMisplacedAssertion: Shared CLI timeout contract assertion.
  expect(result.exitCode, result.stdout + result.stderr).toBe(7);
  // biome-ignore lint/suspicious/noMisplacedAssertion: Shared CLI timeout contract assertion.
  expect(JSON.parse(result.stdout).error.name).toBe("state_locked");
}
export function barrierPath() {
  return join(makeTempDir("crew-target-barrier-"), "ready");
}
