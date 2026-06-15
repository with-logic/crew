/**
 * Installer script smoke tests.
 *
 * The public install path is a site artifact rather than TypeScript runtime,
 * so these tests pin the advertised shell and syntax-check the Bash script.
 */

import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const INSTALL_SCRIPT = "site/public/install.sh";
const INSTALL_COMMAND = "curl -fsSL https://crew.logic.inc/install.sh | bash";

describe("public installer", () => {
  test("advertised command uses the Bash shell the installer requires", () => {
    const readme = readFileSync("README.md", "utf8");
    const site = readFileSync("site/components/sections/Install.tsx", "utf8");
    const script = readFileSync(INSTALL_SCRIPT, "utf8");
    expect(readme).toContain(INSTALL_COMMAND);
    expect(site).toContain(INSTALL_COMMAND);
    expect(script).toContain(INSTALL_COMMAND);
    expect(readme).not.toContain("install.sh | sh");
    expect(site).not.toContain("install.sh | sh");
    expect(script).not.toContain("install.sh | sh");
  });

  test("installer parses under Bash", () => {
    const proc = Bun.spawnSync({
      cmd: ["bash", "-n", INSTALL_SCRIPT],
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(proc.exitCode).toBe(0);
  });

  test.each([
    ["Darwin", "arm64", "crew-macos-arm64"],
    ["Linux", "x86_64", "crew-linux-x64"],
    ["Linux", "aarch64", "crew-linux-arm64"],
  ])("installer downloads %s/%s asset", (os, arch, asset) => {
    const env = installEnv(os, arch, asset);
    const proc = runInstaller(env);
    expect(proc.exitCode).toBe(0);
    expect(existsSync(join(env.prefix, "crew"))).toBe(true);
    expect(readFileSync(env.curlLog, "utf8")).toContain(
      `https://github.com/with-logic/crew/releases/download/v9.9.9/${asset}`,
    );
  });

  test("installer rejects unsupported platforms before downloading", () => {
    const env = installEnv("FreeBSD", "x86_64", "unused");
    const proc = runInstaller(env);
    expect(proc.exitCode).toBe(1);
    expect(new TextDecoder().decode(proc.stderr)).toContain("unsupported platform: FreeBSD/x86_64");
    expect(readFileSync(env.curlLog, "utf8")).toBe("");
  });
});

type InstallEnv = {
  readonly curlLog: string;
  readonly env: NodeJS.ProcessEnv;
  readonly prefix: string;
};

function installEnv(os: string, arch: string, asset: string): InstallEnv {
  const root = mkdtempSync(join(tmpdir(), "crew-install-script-"));
  const bin = join(root, "bin");
  const prefix = join(root, "prefix");
  mkdirSync(bin);
  writeFakeTool(
    bin,
    "uname",
    `#!/bin/sh
case "$1" in
  -s) printf '%s\\n' "$FAKE_OS" ;;
  -m) printf '%s\\n' "$FAKE_ARCH" ;;
  *) exit 1 ;;
esac
`,
  );
  writeFakeTool(bin, "openssl", "#!/bin/sh\nexit 0\n");
  writeFakeTool(bin, "shasum", '#!/bin/sh\nprintf \'%s  %s\\n\' "$FAKE_BINARY_SHA" "$3"\n');
  writeFakeTool(
    bin,
    "curl",
    `#!/bin/sh
out=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -w) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
printf '%s\\n' "$url" >> "$FAKE_CURL_LOG"
case "$url" in
  */latest) printf 'https://github.com/with-logic/crew/releases/tag/v9.9.9' ;;
  */SHA256SUMS) printf '%s  %s\\n' "$FAKE_BINARY_SHA" "$FAKE_ASSET" > "$out" ;;
  */SHA256SUMS.sig) printf 'sig' > "$out" ;;
  *) printf '%s\\n' '#!/usr/bin/env sh' 'case "$1" in' '  version) echo "crew v9.9.9" ;;' '  update) exit 0 ;;' '  *) exit 0 ;;' 'esac' > "$out" ;;
esac
`,
  );
  return {
    curlLog: join(root, "curl.log"),
    prefix,
    env: {
      ...process.env,
      CREW_INSTALL_PREFIX: prefix,
      CREW_VERSION: "v9.9.9",
      FAKE_ARCH: arch,
      FAKE_ASSET: asset,
      FAKE_BINARY_SHA: "abc123",
      FAKE_CURL_LOG: join(root, "curl.log"),
      FAKE_OS: os,
      HOME: root,
      PATH: `${bin}:/usr/bin:/bin`,
    },
  };
}

function writeFakeTool(dir: string, name: string, body: string): void {
  const path = join(dir, name);
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function runInstaller(input: InstallEnv): ReturnType<typeof Bun.spawnSync> {
  writeFileSync(input.curlLog, "");
  return Bun.spawnSync({
    cmd: ["/bin/bash", INSTALL_SCRIPT],
    env: input.env,
    stdout: "pipe",
    stderr: "pipe",
  });
}
