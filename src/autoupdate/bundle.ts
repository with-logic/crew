/**
 * Minimal "attribution bundle" for Login Items on macOS Ventura+.
 *
 * When a launchd agent runs a binary that isn't inside a `.app` bundle,
 * Login Items falls back to the executable's code-signing team to label
 * the entry. For `dist/crew` that means "Jarred Sumner" (Bun's signer)
 * rather than "Crew". We can't change Bun's signature, but we *can*
 * give launchd a bundle to associate the agent with via the plist key
 * `AssociatedBundleIdentifiers`.
 *
 * We write a tiny no-executable bundle at `~/.crew/Crew.app/` whose only
 * purpose is to carry the display name we want Login Items to show.
 * macOS then attributes the agent to "Crew Skill Autoupdate" instead of the
 * binary's signer.
 *
 * The bundle isn't code-signed and isn't meant to be launched — it's
 * just metadata that Login Items reads.
 */

import { join } from "node:path";
import { paths } from "../core/paths.ts";
import { ensureDir, writeText } from "../util/fs.ts";

/** Reverse-DNS identifier used by the bundle and referenced by the plist. */
export const BUNDLE_IDENTIFIER = "sh.crew.autoupdater";
/** User-visible name Login Items should show. */
export const BUNDLE_DISPLAY_NAME = "Crew Skill Autoupdate";

/** The absolute path to the bundle directory (inside `~/.crew/`). */
export function bundlePath(home: string): string {
  return join(paths(home).home, "Crew.app");
}

/**
 * Write the attribution bundle's `Info.plist`. Creates `Crew.app/Contents/`
 * if missing. Idempotent: overwriting is fine — the content is a function
 * of the constants above.
 */
export function writeAttributionBundle(home: string): string {
  const root = bundlePath(home);
  const contents = join(root, "Contents");
  ensureDir(contents);
  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>${BUNDLE_IDENTIFIER}</string>
  <key>CFBundleName</key><string>${BUNDLE_DISPLAY_NAME}</string>
  <key>CFBundleDisplayName</key><string>${BUNDLE_DISPLAY_NAME}</string>
  <key>CFBundleExecutable</key><string>Crew</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSUIElement</key><true/>
  <key>LSBackgroundOnly</key><true/>
</dict>
</plist>
`;
  writeText(join(contents, "Info.plist"), infoPlist);
  return root;
}
