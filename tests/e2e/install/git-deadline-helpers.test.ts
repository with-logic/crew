/**
 * A git command stopped at its deadline (§17.1, C-INST-26) takes its
 * transport helper with it: no `git-remote-http` is left holding a
 * connection to the stalled remote.
 *
 * The remote is a server on this machine's loopback address that accepts
 * a connection and never answers, so nothing leaves the machine; the
 * tripwire is told so with `allowRemoteGit`.
 */

import { afterEach, expect, test } from "bun:test";
import { CrewError } from "../../../src/core/errors.ts";
import { remoteCommitOf } from "../../../src/git/repo/remote.ts";
import { allowRemoteGit } from "../../helpers/no-network.ts";

/** Accepts connections and never answers; prints its port. A separate process, because git runs synchronously. */
const STALLING_SERVER = `
  const held = [];
  const server = require("node:net").createServer((socket) => held.push(socket));
  server.listen(0, "127.0.0.1", () => console.log(server.address().port));
`;

const before = process.env["CREW_GIT_TIMEOUT_SECONDS"];
let server: ReturnType<typeof Bun.spawn> | null = null;
afterEach(() => {
  server?.kill();
  server = null;
  if (before === undefined) delete process.env["CREW_GIT_TIMEOUT_SECONDS"];
  else process.env["CREW_GIT_TIMEOUT_SECONDS"] = before;
});

/** Start the stalling server and return its URL. */
async function startStallingRemote(): Promise<string> {
  const started = Bun.spawn([process.execPath, "-e", STALLING_SERVER], { stdout: "pipe" });
  server = started;
  const { value } = await started.stdout.getReader().read();
  return `http://127.0.0.1:${new TextDecoder().decode(value).trim()}/stalled.git`;
}

/** The commands of running processes that mention `needle`. */
function processesMentioning(needle: string): string[] {
  const listing = Bun.spawnSync(["ps", "-eo", "command"]).stdout.toString();
  return listing.split("\n").filter((command) => command.includes(needle));
}

test("C-INST-26 a remote lookup stopped at the deadline leaves no transport helper behind", async () => {
  const url = await startStallingRemote();
  process.env["CREW_GIT_TIMEOUT_SECONDS"] = "1";
  let thrown: unknown;

  try {
    allowRemoteGit(() => remoteCommitOf(url, null));
  } catch (err) {
    thrown = err;
  }
  // The helper is stopped by git as git exits; give that a moment to land.
  await Bun.sleep(500);

  expect(thrown).toBeInstanceOf(CrewError);
  expect((thrown as CrewError).code).toBe("source_unreachable");
  expect((thrown as CrewError).message).toContain("git did not finish within 1 second");
  expect(processesMentioning(url)).toEqual([]);
});
