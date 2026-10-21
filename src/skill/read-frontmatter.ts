/** Read frontmatter metadata without retaining bodies or malformed candidates (§9 step 4). */

import { closeSync, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import type { YamlValue } from "../yaml/parse.ts";
import { extractFrontmatter } from "./frontmatter.ts";

/** Parse only a proven complete header, keeping the existing parser's errors and semantics. */
export function readFrontmatter(path: string): YamlValue {
  const fd = openSync(path, "r");
  try {
    const extent = frontmatterExtent(fd);
    if (typeof extent === "string") return extractFrontmatter(extent).data;
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

/** Return an exclusive byte end, or synthetic inputs preserving missing/unclosed parser errors. */
function frontmatterExtent(fd: number): number | "" | "---" {
  const buffer = Buffer.alloc(4096);
  const decoder = new StringDecoder("utf8");
  let position = 0;
  let opened = false;
  let dashes = 0;
  let trailingSpace = false;
  let invalid = false;
  for (;;) {
    const size = readSync(fd, buffer, 0, buffer.length, position);
    const text = size === 0 ? `${decoder.end()}\n` : decoder.write(buffer.subarray(0, size));
    let lineEnd = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      if (char === 13 || char === 10) {
        lineEnd = buffer.indexOf(char, lineEnd) + 1;
        const delimiter = dashes === 3 && !invalid;
        if (opened && delimiter) return size === 0 ? position : position + lineEnd;
        if (!opened && dashes !== 0) {
          if (!delimiter) return "";
          opened = true;
        }
        dashes = 0;
        trailingSpace = false;
        invalid = false;
      } else if (text[i]!.trim() === "") trailingSpace ||= dashes > 0;
      else if (char === 45 && dashes < 3 && !trailingSpace && !invalid) dashes++;
      else {
        if (!opened) return "";
        invalid = true;
      }
    }
    // The synthetic EOF newline above also recognizes a closing delimiter at EOF.
    if (size === 0) break;
    position += size;
  }
  return opened ? "---" : "";
}
