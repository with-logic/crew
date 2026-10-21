/** Read frontmatter metadata without retaining bodies or malformed candidates (§9 step 4). */

import { closeSync, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import type { YamlValue } from "../yaml/parse.ts";
import { extractFrontmatter } from "./frontmatter.ts";

// Small fixed reads bound scanning memory without issuing a syscall for every line.
const FRONTMATTER_READ_CHUNK_BYTES = 4096;
const CARRIAGE_RETURN = "\r".charCodeAt(0);
const LINE_FEED = "\n".charCodeAt(0);
const DASH = "-".charCodeAt(0);

type FrontmatterScanResult =
  | { readonly kind: "complete"; readonly byteEnd: number }
  | { readonly kind: "parser-input"; readonly parserInput: "" | "---" };

/** Parse only a proven complete header, keeping the existing parser's errors and semantics. */
export function readFrontmatter(path: string): YamlValue {
  const fd = openSync(path, "r");
  try {
    const scan = scanFrontmatter(fd);
    if (scan.kind === "parser-input") return extractFrontmatter(scan.parserInput).data;
    const extent = scan.byteEnd;
    const prefix = Buffer.alloc(extent);
    let offset = 0;
    let size: number;
    // Both passes use the same descriptor, including if the pathname is replaced.
    do {
      size = readSync(fd, prefix, offset, extent - offset, offset);
      offset += size;
    } while (size > 0 && offset < extent);
    return extractFrontmatter(prefix.toString("utf8", 0, offset)).data;
  } finally {
    closeSync(fd);
  }
}

/** Find a complete header's byte end, or inputs preserving missing/unclosed parser errors. */
function scanFrontmatter(fd: number): FrontmatterScanResult {
  const buffer = Buffer.alloc(FRONTMATTER_READ_CHUNK_BYTES);
  const decoder = new StringDecoder("utf8");
  let position = 0;
  let opened = false;
  let dashes = 0;
  let trailingSpace = false;
  let invalid = false;
  for (;;) {
    const size = readSync(fd, buffer, 0, buffer.length, position);
    const chunk = buffer.subarray(0, size);
    let start = 0;
    if (opened && invalid && size > 0) {
      // An invalid delimiter line cannot recover before CR/LF; UTF-8 never embeds those bytes.
      const cr = chunk.indexOf(CARRIAGE_RETURN);
      const lf = chunk.indexOf(LINE_FEED);
      start = Math.min(cr < 0 ? size : cr, lf < 0 ? size : lf);
      decoder.end();
    }
    const text = size === 0 ? `${decoder.end()}\n` : decoder.write(chunk.subarray(start));
    let lineEnd = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      if (char === CARRIAGE_RETURN || char === LINE_FEED) {
        lineEnd = buffer.indexOf(char, lineEnd) + 1;
        const delimiter = dashes === 3 && !invalid;
        if (opened && delimiter)
          return { kind: "complete", byteEnd: size === 0 ? position : position + lineEnd };
        if (!opened && dashes !== 0) {
          if (!delimiter) return { kind: "parser-input", parserInput: "" };
          opened = true;
        }
        dashes = 0;
        trailingSpace = false;
        invalid = false;
      } else if (text[i]!.trim() === "") trailingSpace ||= dashes > 0;
      else {
        const extendsDelimiter = char === DASH && dashes < 3 && !trailingSpace && !invalid;
        if (extendsDelimiter) dashes++;
        else {
          if (!opened) return { kind: "parser-input", parserInput: "" };
          invalid = true;
        }
      }
    }
    // The synthetic EOF newline above also recognizes a closing delimiter at EOF.
    if (size === 0) break;
    position += size;
  }
  return { kind: "parser-input", parserInput: opened ? "---" : "" };
}
