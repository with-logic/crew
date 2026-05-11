/**
 * Render generated known-tap registry data as TypeScript (§16.2.1).
 */

import type { KnownTap } from "../types.ts";

const MAX_INLINE_SKILLS = 24;

export interface RenderedKnownTapRegistryFile {
  readonly path: string;
  readonly contents: string;
}

export function renderKnownTapRegistry(
  taps: readonly KnownTap[],
): readonly RenderedKnownTapRegistryFile[] {
  return [...taps.flatMap(renderTapModules), renderIndexModule(taps)];
}

function renderTapModules(tap: KnownTap): readonly RenderedKnownTapRegistryFile[] {
  if (tap.skills.length <= MAX_INLINE_SKILLS) return [renderInlineTapModule(tap)];
  return renderSplitTapModules(tap);
}

function renderInlineTapModule(tap: KnownTap): RenderedKnownTapRegistryFile {
  const json = JSON.stringify(tap, null, 2);
  const exportName = exportNameFor(tap.name);
  return {
    path: `${tap.name}.ts`,
    contents: `/**
 * Generated known-tap registry data for ${tap.name} (§16.2.1).
 *
 * Do not edit by hand. Run \`bun run known-taps build\` after changing
 * \`known-taps/manifest.json\`.
 */

import type { KnownTap } from "../types.ts";

export const ${exportName} = ${json} as const satisfies KnownTap;
`,
  };
}

function renderSplitTapModules(tap: KnownTap): readonly RenderedKnownTapRegistryFile[] {
  const chunks = chunk(tap.skills, MAX_INLINE_SKILLS);
  const skillFiles = chunks.map((skills, index) => renderSkillChunkModule(tap.name, skills, index));
  return [...skillFiles, renderSplitTapModule(tap, chunks.length)];
}

function renderSkillChunkModule(
  tapName: string,
  skills: KnownTap["skills"],
  index: number,
): RenderedKnownTapRegistryFile {
  const exportName = `${exportNameFor(tapName)}_SKILLS_${index + 1}`;
  return {
    path: `${tapName}-skills-${index + 1}.ts`,
    contents: `/**
 * Generated known-tap skill data for ${tapName} (§16.2.1).
 *
 * Do not edit by hand. Run \`bun run known-taps build\` after changing
 * \`known-taps/manifest.json\`.
 */

import type { KnownTapSkill } from "../types.ts";

export const ${exportName} = ${JSON.stringify(skills, null, 2)} as const satisfies readonly KnownTapSkill[];
`,
  };
}

function renderSplitTapModule(tap: KnownTap, chunkCount: number): RenderedKnownTapRegistryFile {
  const exportName = exportNameFor(tap.name);
  const imports = Array.from(
    { length: chunkCount },
    (_, index) =>
      `import { ${exportName}_SKILLS_${index + 1} } from "./${tap.name}-skills-${index + 1}.ts";`,
  ).join("\n");
  const skills = Array.from(
    { length: chunkCount },
    (_, index) => `...${exportName}_SKILLS_${index + 1}`,
  ).join(", ");
  const fields = [
    `"name": ${JSON.stringify(tap.name)}`,
    `"url": ${JSON.stringify(tap.url)}`,
    `"subpath": ${JSON.stringify(tap.subpath)}`,
    `"description": ${JSON.stringify(tap.description)}`,
    `"trust": ${JSON.stringify(tap.trust)}`,
    `"skills": [${skills}]`,
  ]
    .map((field) => `  ${field},`)
    .join("\n");
  return {
    path: `${tap.name}.ts`,
    contents: `/**
 * Generated known-tap registry data for ${tap.name} (§16.2.1).
 *
 * Do not edit by hand. Run \`bun run known-taps build\` after changing
 * \`known-taps/manifest.json\`.
 */

import type { KnownTap } from "../types.ts";
${imports}

export const ${exportName} = {
${fields}
} as const satisfies KnownTap;
`,
  };
}

function renderIndexModule(taps: readonly KnownTap[]): RenderedKnownTapRegistryFile {
  const imports = taps
    .map((tap) => `import { ${exportNameFor(tap.name)} } from "./${tap.name}.ts";`)
    .join("\n");
  const values = renderExportList(taps.map((tap) => exportNameFor(tap.name)));
  const importBlock = imports.length === 0 ? "" : `${imports}\n`;
  return {
    path: "index.ts",
    contents: `/**
 * Generated known-tap registry data (§16.2.1).
 *
 * Do not edit by hand. Run \`bun run known-taps build\` after changing
 * \`known-taps/manifest.json\`.
 */

import type { KnownTap } from "../types.ts";
${importBlock}
export const GENERATED_KNOWN_TAPS = ${values} as const satisfies readonly KnownTap[];
`,
  };
}

function exportNameFor(tapName: string): string {
  return `${tapName.replaceAll("-", "_").toUpperCase()}_KNOWN_TAP`;
}

function renderExportList(values: readonly string[]): string {
  if (values.length === 0) return "[]";
  return `[\n  ${values.join(",\n  ")},\n]`;
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
