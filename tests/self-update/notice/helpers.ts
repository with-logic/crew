/**
 * Shared harness for the update-notice suites (§17.3): a recording release
 * fetcher plus a NoticeContext builder.
 */

import { setReleaseFetcher } from "../../../src/self-update/github.ts";
import type { NoticeContext } from "../../../src/self-update/notice.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";

export interface Harness {
  readonly home: string;
  readonly fetches: string[];
  readonly streams: ReturnType<typeof captureStreams>;
  ctx(overrides?: Partial<NoticeContext>): NoticeContext;
}

/** Install a fetcher that records every call and returns the given tag. */
export function makeHarness(latestTag: string | "throw" = "v99.99.99"): Harness {
  const home = makeCrewHome();
  const fetches: string[] = [];
  setReleaseFetcher((url) => {
    fetches.push(url);
    if (latestTag === "throw") throw new Error("simulated network failure");
    return { tag: latestTag, assets: {} };
  });
  const streams = captureStreams();
  return {
    home,
    fetches,
    streams,
    ctx(overrides = {}) {
      return {
        command: "list",
        home,
        json: false,
        quiet: false,
        streams: streams.streams,
        stderrIsTty: true,
        ...overrides,
      };
    },
  };
}
