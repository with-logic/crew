/**
 * Minimal YAML parser for the subset crew needs.
 *
 * Crew reads YAML from two places:
 *
 *   - `SKILL.md` frontmatter — per the Agent Skills spec.
 *   - `config.yaml` — the user's tap / autoupdate / target-override config.
 *
 * Both use a small, well-behaved subset: scalars (strings, numbers,
 * booleans, null), nested mappings, block-style lists of scalars or
 * mappings, and `"quoted"` / `'quoted'` string literals. Anchors, aliases,
 * multi-document streams, tags, flow collections, and block scalars
 * (`|`/`>`) are NOT supported.
 *
 * Rejecting input this parser can't handle with `config_invalid` /
 * `invalid_skill` errors is the correct behavior — we'd rather refuse an
 * unusual YAML file than silently misread it.
 */

/** The value kinds this parser produces. */
export type YamlValue = string | number | boolean | null | YamlValue[] | YamlMap;
export type YamlMap = { [key: string]: YamlValue };

/** Parse a YAML source string. Throws `Error` on any syntactic failure. */
export function parseYaml(source: string): YamlValue {
  const lines = splitLogicalLines(source);
  if (lines.length === 0) return null;
  const [value, consumed] = parseBlock(lines, 0, 0);
  if (consumed !== lines.length) {
    // If the leftover is purely blank/comments, that's fine. Otherwise fail.
    for (let i = consumed; i < lines.length; i++) {
      if (!isBlankOrComment(lines[i]!)) {
        throw new Error(`unexpected content at line ${i + 1}`);
      }
    }
  }
  return value;
}

/** Split input into lines and drop blank/comment-only lines' trailing comments. */
function splitLogicalLines(source: string): string[] {
  // Normalize line endings; yaml is line-sensitive.
  const raw = source.replace(/\r\n?/g, "\n").split("\n");
  // Don't trim — indentation matters. But drop a trailing empty line if any.
  if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
  return raw;
}

function isBlankOrComment(line: string): boolean {
  const s = stripComment(line).trim();
  return s.length === 0;
}

/** Strip a `# comment` if one appears outside of a quoted region. */
function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Count leading spaces (YAML forbids tabs for indentation). */
function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  if (n < line.length && line[n] === "\t") {
    throw new Error("tabs are not allowed for indentation");
  }
  return n;
}

/**
 * Parse a block value starting at `lines[idx]` whose indent is `baseIndent`.
 * Returns the parsed value and the number of lines consumed starting from `idx`.
 */
function parseBlock(lines: string[], idx: number, baseIndent: number): [YamlValue, number] {
  // Skip leading blank/comment lines.
  let i = idx;
  while (i < lines.length && isBlankOrComment(lines[i]!)) i++;
  if (i >= lines.length) return [null, i - idx + 0];

  const firstLine = lines[i]!;
  const indent = indentOf(firstLine);
  if (indent < baseIndent) {
    // Nothing to parse at this level.
    return [null, i - idx];
  }
  const stripped = stripComment(firstLine);
  const trimmed = stripped.slice(indent);

  // List?
  if (trimmed.startsWith("- ") || trimmed === "-") {
    return parseList(lines, i, indent, idx);
  }

  // Mapping? Must contain a `:` at this level.
  if (containsKey(trimmed)) {
    return parseMap(lines, i, indent, idx);
  }

  // Otherwise a lone scalar (inline).
  const scalar = parseScalar(trimmed);
  return [scalar, i - idx + 1];
}

/** True if a trimmed line appears to be a mapping key. */
function containsKey(trimmed: string): boolean {
  // Find a `:` outside quoted regions.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      const next = trimmed[i + 1];
      if (next === undefined || next === " ") return true;
    }
  }
  return false;
}

/** Parse a block list at the given indent. */
function parseList(lines: string[], start: number, indent: number, origin: number): [YamlValue[], number] {
  const items: YamlValue[] = [];
  let i = start;
  while (i < lines.length) {
    if (isBlankOrComment(lines[i]!)) {
      i++;
      continue;
    }
    const line = lines[i]!;
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      throw new Error(`unexpected indent at line ${i + 1}`);
    }
    const stripped = stripComment(line).slice(indent);
    if (!(stripped.startsWith("- ") || stripped === "-")) break;
    const afterDash = stripped === "-" ? "" : stripped.slice(2);
    if (afterDash.trim() === "") {
      // Nested block starting on next line.
      const [value, consumed] = parseBlock(lines, i + 1, indent + 2);
      items.push(value);
      i = i + 1 + consumed;
    } else if (containsKey(afterDash)) {
      // Inline mapping start: `- key: value` (maybe more keys follow on
      // subsequent more-indented lines).
      const nestedIndent = indent + 2;
      // Synthesize a fake line with the same indent to reuse parseMap.
      const synthetic = [" ".repeat(nestedIndent) + afterDash, ...lines.slice(i + 1)];
      const [mapValue, consumedSyn] = parseMap(synthetic, 0, nestedIndent, 0);
      items.push(mapValue);
      i = i + consumedSyn; // one for current line; remaining were fed in.
    } else {
      // Inline scalar.
      items.push(parseScalar(afterDash));
      i++;
    }
  }
  return [items, i - origin];
}

/** Parse a block mapping at the given indent. */
function parseMap(lines: string[], start: number, indent: number, origin: number): [YamlMap, number] {
  const map: YamlMap = {};
  let i = start;
  while (i < lines.length) {
    if (isBlankOrComment(lines[i]!)) {
      i++;
      continue;
    }
    const line = lines[i]!;
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      throw new Error(`unexpected indent at line ${i + 1}`);
    }
    const stripped = stripComment(line).slice(indent);
    if (!containsKey(stripped)) break;
    const { key, valuePart } = splitKey(stripped);
    if (valuePart.trim() === "") {
      // Nested block.
      // Find next non-blank line to determine whether it's a nested mapping/list
      // or an empty value.
      let look = i + 1;
      while (look < lines.length && isBlankOrComment(lines[look]!)) look++;
      if (look >= lines.length || indentOf(lines[look]!) <= indent) {
        map[key] = null;
        i++;
      } else {
        const [value, consumed] = parseBlock(lines, i + 1, indentOf(lines[look]!));
        map[key] = value;
        i = i + 1 + consumed;
      }
    } else {
      map[key] = parseScalar(valuePart);
      i++;
    }
  }
  return [map, i - origin];
}

/** Split a `key: value` line into its two parts. */
function splitKey(stripped: string): { key: string; valuePart: string } {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      const next = stripped[i + 1];
      if (next === undefined || next === " ") {
        const key = unquoteKey(stripped.slice(0, i).trim());
        const valuePart = stripped.slice(i + 1).trim();
        return { key, valuePart };
      }
    }
  }
  throw new Error(`invalid mapping key: ${stripped}`);
}

function unquoteKey(raw: string): string {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return parseScalar(raw) as string;
  }
  return raw;
}

/** Parse a scalar literal: number, boolean, null, or string (quoted or plain). */
function parseScalar(raw: string): YamlValue {
  const s = raw.trim();
  if (s.length === 0) return null;

  if (s.startsWith('"')) {
    if (!s.endsWith('"') || s.length < 2) throw new Error(`bad double-quoted string: ${s}`);
    return unescapeDouble(s.slice(1, -1));
  }
  if (s.startsWith("'")) {
    if (!s.endsWith("'") || s.length < 2) throw new Error(`bad single-quoted string: ${s}`);
    return s.slice(1, -1).replace(/''/g, "'");
  }

  // Empty flow collections.
  if (s === "[]") return [];
  if (s === "{}") return {};

  // Reserved scalars.
  if (s === "null" || s === "~" || s === "Null" || s === "NULL") return null;
  if (s === "true" || s === "True" || s === "TRUE") return true;
  if (s === "false" || s === "False" || s === "FALSE") return false;

  // Numbers: integers and simple floats.
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);

  // Plain string.
  return s;
}

function unescapeDouble(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === "\\" && i + 1 < body.length) {
      const next = body[i + 1]!;
      i++;
      switch (next) {
        case "n": out += "\n"; break;
        case "t": out += "\t"; break;
        case "r": out += "\r"; break;
        case '"': out += '"'; break;
        case "\\": out += "\\"; break;
        case "/": out += "/"; break;
        default: out += next; break;
      }
    } else {
      out += ch;
    }
  }
  return out;
}
