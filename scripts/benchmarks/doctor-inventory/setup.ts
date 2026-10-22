/** Public install-generated healthy fixtures for PRD §11.2; no authored state or markers. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Fixture } from "./types.ts";

export function setupFixture(fixture: Fixture): void {
  const { input, path, home, projectRoots, cwd, env, invoke } = fixture;
  mkdirSync(home, { recursive: true });
  for (const root of projectRoots) mkdirSync(root, { recursive: true });
  writeFileSync(
    join(home, "config.yaml"),
    [
      "taps:",
      "  - name: core",
      "    kind: git",
      "    registered: true",
      `    url: ${JSON.stringify(`file://${join(path, "offline-core")}`)}`,
      '    subpath: ""',
      '    path: ""',
      "disabled_agents: []",
      "forced_agents: []",
      "autoupdate:",
      "  enabled: false",
      "  interval_seconds: 14400",
      "",
    ].join("\n"),
  );
  if (!input.fresh) {
    const source = join(path, "source", "measure-skill");
    mkdirSync(source, { recursive: true });
    writeFileSync(
      join(source, "SKILL.md"),
      "---\nname: measure-skill\ndescription: Local doctor measurement fixture.\n---\nFixture bytes.\n",
    );
    const agents = env.ALL_AGENTS.flatMap((a) => ["--agent", a.name]);
    for (const [scope, roots] of [
      ["user", [cwd]],
      ["project", projectRoots],
    ] as const) {
      for (const root of roots) {
        const out = invoke(["install", source, "--scope", scope, "--json", ...agents], root);
        if (out.code !== 0) throw new Error(`fixture install failed: ${JSON.stringify(out)}`);
      }
    }
  }
  if (env.transportViolations.length) throw new Error("setup attempted forbidden git transport");
}
