/**
 * Keeps release-signing public key embeds in sync with the canonical PEM (§10.3).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUBLIC_KEY_PATH = join(ROOT, "release/signing-public-key.pem");
const INSTALLER_PATH = join(ROOT, "site/public/install.sh");
const START_MARKER = "# BEGIN CREW RELEASE SIGNING PUBLIC KEY";
const END_MARKER = "# END CREW RELEASE SIGNING PUBLIC KEY";

export function normalizedPublicKeyPem(): string {
  const pem = `${readFileSync(PUBLIC_KEY_PATH, "utf8").replaceAll("\r\n", "\n").trimEnd()}\n`;
  if (!pem.startsWith("-----BEGIN PUBLIC KEY-----\n")) {
    throw new Error(`${PUBLIC_KEY_PATH} must start with a PUBLIC KEY PEM header`);
  }
  if (!pem.endsWith("\n-----END PUBLIC KEY-----\n")) {
    throw new Error(`${PUBLIC_KEY_PATH} must end with a PUBLIC KEY PEM footer`);
  }
  return pem;
}

export function installerWithPublicKey(installer: string, pem: string): string {
  const pattern = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`);
  if (!pattern.test(installer)) {
    throw new Error(`${INSTALLER_PATH} is missing release-signing public key markers`);
  }
  return installer.replace(pattern, installerPublicKeyBlock(pem));
}

function installerPublicKeyBlock(pem: string): string {
  return `${START_MARKER}
cat > "$public_key" <<'PEM'
${pem}PEM
${END_MARKER}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function run(): void {
  const mode = process.argv[2] ?? "--check";
  if (mode !== "--check" && mode !== "--write") {
    process.stderr.write("usage: bun run scripts/sync-release-signing-key.ts [--check|--write]\n");
    process.exitCode = 2;
    return;
  }

  const pem = normalizedPublicKeyPem();
  const installer = readFileSync(INSTALLER_PATH, "utf8");
  const updatedInstaller = installerWithPublicKey(installer, pem);
  if (updatedInstaller === installer) return;
  if (mode === "--check") {
    process.stderr.write(
      "release signing key embeds are stale; run `bun run sync-release-signing-key`\n",
    );
    process.exitCode = 1;
    return;
  }

  writeFileSync(INSTALLER_PATH, updatedInstaller);
  process.stdout.write("updated site/public/install.sh from release/signing-public-key.pem\n");
}

run();
