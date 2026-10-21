/** Known-tap install hints quote a complete reference for POSIX shells (§5.1, §16.6). */

import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { resetKnownTapsForTest, setKnownTapsForTest } from "../../../src/known-taps/registry.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";

afterEach(resetKnownTapsForTest);

test("C-TAP-23 install hints quote shell syntax while simple hints and JSON remain unchanged", () => {
  const home = makeCrewHome();
  expect(
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams }),
  ).toBe(0);
  const configPath = join(home, "config.yaml");
  const originalConfig = readFileSync(configPath, "utf8");
  const namespace = "space ; $value $(word) `word` 'quote' * [glob]";
  const description = "catalog skill";
  setKnownTapsForTest([
    {
      name: "trusted",
      url: "https://example.com/skills.git",
      subpath: "",
      trust: "curated",
      description: "catalog",
      skills: [
        { name: "demo", namespace, description, path: `${namespace}/demo` },
        { name: "healthy", namespace: null, description, path: "healthy" },
      ],
    },
  ]);
  const human = captureStreams();
  expect(runCli(["search", "catalog"], { home, streams: human.streams })).toBe(0);
  expect(human.stdout()).toContain(
    "(crew install 'trusted/space ; $value $(word) `word` '\\''quote'\\'' * [glob]/demo')",
  );
  expect(human.stdout()).toContain("(crew install trusted/healthy)");

  const json = captureStreams();
  expect(runCli(["search", "catalog", "--json"], { home, streams: json.streams })).toBe(0);
  expect(JSON.parse(json.stdout()).known_hits).toContainEqual({
    tap: "trusted",
    url: "https://example.com/skills.git",
    subpath: "",
    trust: "curated",
    name: "demo",
    namespace,
    description,
  });
  expect(readFileSync(configPath, "utf8")).toBe(originalConfig);
});
