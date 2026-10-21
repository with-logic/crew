/** Real child CLI paused at the git seam while source bytes are live (§14). */

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/** Pause after a real commit export, before its consumer reads the exported files. */
export function pausedInstall(home: string, target: string, refs: string[], barrier: string) {
  const script = `
import {existsSync,writeFileSync} from "node:fs";
import {ALL_AGENTS} from ${JSON.stringify(join(root, "src/agents/registry.ts"))};
import {runCli} from ${JSON.stringify(join(root, "src/cli/main.ts"))};
import {setGitRunner} from ${JSON.stringify(join(root, "src/git/exec.ts"))};
for(const agent of ALL_AGENTS){
 agent.detect=()=>agent.name==="claude-code";
 agent.userPath=()=>${JSON.stringify(target)};
 agent.projectPath=()=>${JSON.stringify(target)};
}
let paused=false;
const workTreePrefix="--work-tree=";
const previous=setGitRunner((args,options)=>{
 const result=previous(args,options);
 const workTreeArg=args.find(a=>a.startsWith(workTreePrefix));
 if(!paused&&workTreeArg){
  paused=true;
  writeFileSync(${JSON.stringify(barrier)},workTreeArg.slice(workTreePrefix.length));
  const deadline=Date.now()+15000;
  while(!existsSync(${JSON.stringify(`${barrier}.release`)})){
   if(Date.now()>deadline)throw new Error("barrier timed out");
   Bun.sleepSync(10);
  }
 }
 return result;
});
process.exitCode=runCli(["install",...${JSON.stringify(refs)},"--agent","claude-code","--json"],{home:${JSON.stringify(home)}});
`;
  return Bun.spawn([process.execPath, "-e", script], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CREW_HOME: home },
  });
}

/** Poll for up to ten seconds; false means the barrier did not appear before timeout. */
export async function waitForBarrier(barrier: string): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  while (!existsSync(barrier) && Date.now() < deadline) await Bun.sleep(10);
  return existsSync(barrier);
}

/** Always unblock and reap the child, even when an assertion fails. */
export async function finishInstall(child: ReturnType<typeof pausedInstall>, barrier: string) {
  writeFileSync(`${barrier}.release`, "");
  const exitCode = await child.exited;
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  return { exitCode, stdout, stderr };
}
