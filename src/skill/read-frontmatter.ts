/** Read frontmatter metadata without retaining bodies or malformed candidates (§9 step 4). */

import { isAscii } from "node:buffer";
import { closeSync, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import type { YamlValue } from "../yaml/parse.ts";
import { CARRIAGE_RETURN, FrontmatterDelimiterScanner, LINE_FEED } from "./delimiters.ts";
import { extractFrontmatter } from "./frontmatter.ts";

// Small fixed reads bound scanning memory without issuing a syscall for every line.
const FRONTMATTER_READ_CHUNK_BYTES = 4096;

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
  const scan = new FrontmatterDelimiterScanner();
  for (;;) {
    const size = readSync(fd, buffer, 0, buffer.length, position);
    if (size === 0) {
      scan.write(decoder.end());
      break;
    }
    const chunk = buffer.subarray(0, size);
    if (isAscii(chunk)) {
      // ASCII cannot complete a pending UTF-8 sequence; flush its replacement character first.
      const pending = decoder.end();
      if (pending !== "") scan.write(pending);
      if (scan.kind === "pending") scan.write(chunk);
    } else scan.write(decoder.write(chunk));
    if (scan.kind === "missing") return { kind: "parser-input", parserInput: "" };
    if (scan.kind === "complete") {
      let remaining = scan.lineEndingCharactersInLastWrite;
      let end = 0;
      // Decoding preserves CR/LF, so the scanner's closing boundary exists in this byte chunk.
      while (remaining > 0) {
        if (chunk[end] === CARRIAGE_RETURN || chunk[end] === LINE_FEED) remaining--;
        end++;
      }
      return { kind: "complete", byteEnd: position + end };
    }
    position += size;
  }
  const result = scan.end();
  switch (result.kind) {
    case "complete":
      return { kind: "complete", byteEnd: position };
    case "unclosed":
      return { kind: "parser-input", parserInput: "---" };
    case "missing":
      return { kind: "parser-input", parserInput: "" };
  }
}
