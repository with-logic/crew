/**
 * Installer checksum-tool fallback tests.
 *
 * These run the public Bash installer with an isolated fake PATH so Linux
 * fallback behavior cannot be masked by host `shasum` or `sha256sum`.
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

describe("public installer checksum tools", () => {
  test("uses sha256sum when shasum is unavailable", () => {
    const env = installEnv("sha256sum");
    const proc = runInstaller(env);
    expect(proc.exitCode).toBe(0);
    expect(readFileSync(env.checksumLog, "utf8")).toContain("sha256sum");
  });

  test("fails when neither checksum tool exists", () => {
    const env = installEnv("none");
    const proc = runInstaller(env);
    expect(proc.exitCode).toBe(1);
    expect(new TextDecoder().decode(proc.stderr)).toContain("shasum` or `sha256sum");
    expect(readFileSync(env.curlLog, "utf8")).toBe("");
  });

  test("fails closed when signature verification fails", () => {
    const env = installEnv("sha256sum", { opensslFails: true });
    const proc = runInstaller(env);
    expect(proc.exitCode).toBe(1);
    expect(new TextDecoder().decode(proc.stderr)).toContain("signature verification failed");
    expect(existsSync(join(env.prefix, "crew"))).toBe(false);
  });

  test("fails closed when the binary checksum mismatches", () => {
    const env = installEnv("sha256sum", { actualSha: "def456" });
    const proc = runInstaller(env);
    expect(proc.exitCode).toBe(1);
    expect(new TextDecoder().decode(proc.stderr)).toContain("checksum mismatch");
    expect(existsSync(join(env.prefix, "crew"))).toBe(false);
  });
});

type ChecksumTool = "sha256sum" | "none";

type InstallEnv = {
  readonly checksumLog: string;
  readonly curlLog: string;
  readonly env: NodeJS.ProcessEnv;
  readonly prefix: string;
};

type InstallOptions = {
  readonly actualSha?: string;
  readonly opensslFails?: boolean;
};

function installEnv(tool: ChecksumTool, options: InstallOptions = {}): InstallEnv {
  const root = mkdtempSync(join(tmpdir(), "crew-install-checksum-"));
  const bin = join(root, "bin");
  const prefix = join(root, "prefix");
  writeFakeTool(bin, "uname", '#!/bin/sh\n[ "$1" = -s ] && echo Linux || echo x86_64\n');
  writeFakeTool(bin, "curl", curlTool());
  writeFakeTool(bin, "openssl", '#!/bin/sh\n[ "$FAKE_OPENSSL_FAIL" = 1 ] && exit 1\nexit 0\n');
  writeCoreTools(bin);
  if (tool === "sha256sum") writeChecksumTool(bin);
  return {
    checksumLog: join(root, "checksum.log"),
    curlLog: join(root, "curl.log"),
    prefix,
    env: {
      ...process.env,
      CREW_INSTALL_PREFIX: prefix,
      CREW_VERSION: "v9.9.9",
      FAKE_ACTUAL_SHA: options.actualSha ?? "abc123",
      FAKE_ASSET: "crew-linux-x64",
      FAKE_BINARY_SHA: "abc123",
      FAKE_CHECKSUM_LOG: join(root, "checksum.log"),
      FAKE_CURL_LOG: join(root, "curl.log"),
      FAKE_OPENSSL_FAIL: options.opensslFails ? "1" : "0",
      FAKE_ROOT: root,
      HOME: root,
      PATH: bin,
    },
  };
}

function writeCoreTools(dir: string): void {
  for (const name of ["cat", "chmod", "mkdir", "mv", "rm"]) {
    writeFakeTool(dir, name, `#!/bin/sh\n/bin/${name} "$@"\n`);
  }
  writeFakeTool(
    dir,
    "mktemp",
    '#!/bin/sh\n/bin/mkdir -p "$FAKE_ROOT/tmp"\nprintf \'%s\\n\' "$FAKE_ROOT/tmp"\n',
  );
  writeFakeTool(
    dir,
    "awk",
    '#!/bin/sh\nif [ "$1" = "-v" ]; then printf \'%s\\n\' "$FAKE_BINARY_SHA"; exit 0; fi\nread first rest\nprintf \'%s\\n\' "$first"\n',
  );
}

function writeChecksumTool(dir: string): void {
  writeFakeTool(
    dir,
    "sha256sum",
    '#!/bin/sh\nprintf \'sha256sum\\n\' >> "$FAKE_CHECKSUM_LOG"\nprintf \'%s  %s\\n\' "$FAKE_ACTUAL_SHA" "$1"\n',
  );
}

function curlTool(): string {
  return `#!/bin/sh
out=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
printf '%s\\n' "$url" >> "$FAKE_CURL_LOG"
case "$url" in
  */SHA256SUMS) printf '%s  %s\\n' "$FAKE_BINARY_SHA" "$FAKE_ASSET" > "$out" ;;
  */SHA256SUMS.sig) printf 'sig' > "$out" ;;
  *) printf '%s\\n' '#!/bin/sh' 'exit 0' > "$out" ;;
esac
`;
}

function writeFakeTool(dir: string, name: string, body: string): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function runInstaller(input: InstallEnv): ReturnType<typeof Bun.spawnSync> {
  writeFileSync(input.checksumLog, "");
  writeFileSync(input.curlLog, "");
  return Bun.spawnSync({
    cmd: ["/bin/bash", INSTALL_SCRIPT],
    env: input.env,
    stdout: "pipe",
    stderr: "pipe",
  });
}
