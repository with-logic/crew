/** Offline configured-search fixtures for invalid directory manifests (§16.6). */

import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

export function searchFixture(tapName = "local") {
  const home = makeCrewHome();
  const root = makeTempDir();
  const tap = {
    name: tapName,
    kind: "path" as const,
    registered: true,
    path: root,
    url: "",
    subpath: "",
  };
  writeConfig({ ...readConfig(home), taps: [tap] }, home);
  return {
    root,
    search(args: string[]) {
      const c = captureStreams();
      const code = runCli(["search", ...args], { home, streams: c.streams });
      return { code, out: c.stdout(), err: c.stderr() };
    },
  };
}
