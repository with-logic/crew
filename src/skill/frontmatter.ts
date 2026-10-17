/**
 * Extract and parse SKILL.md frontmatter.
 *
 * Per the Agent Skills spec, every `SKILL.md` begins with a YAML
 * frontmatter block delimited by `---` lines. The rest of the file is the
 * skill body (markdown prose used by the agent).
 */

import { closeSync, openSync, readSync } from "node:fs";
import { CrewError } from "../core/errors.ts";
import { parseYaml, type YamlValue } from "../yaml/parse.ts";

/** The frontmatter and body of a SKILL.md file. */
export interface Frontmatter {
  /** The YAML frontmatter as a raw object. */
  readonly data: YamlValue;
  /** The markdown body after the frontmatter. */
  readonly body: string;
}

/**
 * True iff `raw` opens with a frontmatter delimiter — exactly the files
 * `extractFrontmatter` gets past its first check. A gist file passing it
 * is a skill candidate (§9 step 5, "Gists").
 */
export function opensFrontmatter(raw: string): boolean {
  return openingDelimiter(linesOf(raw)) >= 0;
}

/** Bytes read at a time while looking for a file's first non-blank line. */
const HEAD_CHUNK_BYTES = 4096;

/**
 * `opensFrontmatter` for the file at `path`, read only as far as decides
 * it: through its first non-blank line, or less. Every top-level `.md`
 * file of a gist is asked, and most aren't skills. Throws when the file
 * can't be read.
 */
export function fileOpensFrontmatter(path: string): boolean {
  const fd = openSync(path, "r");
  try {
    const decoder = new TextDecoder();
    const chunk = new Uint8Array(HEAD_CHUNK_BYTES);
    let head = "";
    for (;;) {
      const bytesRead = readSync(fd, chunk);
      const decoded = decoder.decode(chunk.subarray(0, bytesRead), { stream: bytesRead > 0 });
      head = (head + decoded).trimStart();
      const opens = firstLineOpens(head, bytesRead === 0);
      if (opens !== undefined) return opens;
      // Undecided, `head` is at most `---` and spaces: they decide alike.
      head = head.slice(0, 3);
    }
  } finally {
    closeSync(fd);
  }
}

/**
 * Whether `head` — a file's text from its first non-blank character —
 * opens frontmatter (`openingDelimiter`), or `undefined` while that line
 * could still read `---` and more of the file remains.
 */
function firstLineOpens(head: string, atEnd: boolean): boolean | undefined {
  const lineEnd = head.search(/[\r\n]/);
  if (lineEnd >= 0) return head.slice(0, lineEnd).trim() === "---";
  if (atEnd) return head.trim() === "---";
  // A partial delimiter (`-`, `--`), or the delimiter and spaces so far.
  const couldStillOpen = "---".startsWith(head) || /^---\s*$/.test(head);
  return couldStillOpen ? undefined : false;
}

/**
 * Extract frontmatter from a raw SKILL.md string. Throws `invalid_skill`
 * if malformed, naming the file as `subject` — a gist's skill file is
 * `prd.md`, not a SKILL.md (§9 step 5, "Gists").
 */
export function extractFrontmatter(raw: string, subject = "SKILL.md"): Frontmatter {
  const lines = linesOf(raw);
  const opening = openingDelimiter(lines);
  if (opening < 0) {
    throw new CrewError(
      "invalid_skill",
      `${subject} is missing its YAML frontmatter — the first line should be \`---\``,
    );
  }
  const start = opening + 1;
  let end = -1;
  for (let j = start; j < lines.length; j++) {
    if (lines[j]!.trim() === "---") {
      end = j;
      break;
    }
  }
  if (end < 0) {
    throw new CrewError(
      "invalid_skill",
      `${subject} frontmatter never closes — add a \`---\` line after the last YAML field`,
    );
  }
  const yamlSource = lines.slice(start, end).join("\n");
  let data: YamlValue;
  try {
    data = parseYaml(yamlSource);
  } catch (err) {
    throw new CrewError(
      "invalid_skill",
      `${subject} frontmatter isn't valid YAML — ${(err as Error).message}`,
    );
  }
  const body = lines.slice(end + 1).join("\n");
  return { data, body };
}

function linesOf(raw: string): string[] {
  return raw.replace(/\r\n?/g, "\n").split("\n");
}

/** Index of the opening `---`, which must be the first non-blank line; -1 when absent. */
function openingDelimiter(lines: readonly string[]): number {
  const first = lines.findIndex((line) => line.trim() !== "");
  return first >= 0 && lines[first]!.trim() === "---" ? first : -1;
}
