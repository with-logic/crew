/**
 * Minimal YAML writer for the same subset `parseYaml` supports.
 *
 * Used only to serialize `config.yaml` back after modifying it from
 * `crew tap add`, `crew targets enable`, etc. The output is deterministic
 * and human-readable.
 */

import type { YamlValue } from "./parse.ts";

/** Serialize a YAML value with 2-space indentation. */
export function stringifyYaml(value: YamlValue): string {
  const out = writeBlock(value, 0);
  return out.endsWith("\n") ? out : out + "\n";
}

function writeBlock(value: YamlValue, indent: number): string {
  if (value === null) return "null\n";
  if (typeof value === "boolean") return `${value}\n`;
  if (typeof value === "number") return `${value}\n`;
  if (typeof value === "string") return `${writeScalar(value)}\n`;
  if (Array.isArray(value)) return writeList(value, indent);
  return writeMap(value as { [k: string]: YamlValue }, indent);
}

function writeList(items: YamlValue[], indent: number): string {
  if (items.length === 0) return "[]\n";
  const pad = " ".repeat(indent);
  const lines: string[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") {
      lines.push(`${pad}- ${inlineScalar(item)}`);
    } else if (Array.isArray(item)) {
      lines.push(`${pad}-`);
      lines.push(writeList(item, indent + 2).replace(/\n$/, ""));
    } else {
      const body = writeMap(item as { [k: string]: YamlValue }, indent + 2).replace(/\n$/, "").split("\n");
      if (body.length === 0 || (body.length === 1 && body[0]!.trim() === "")) {
        lines.push(`${pad}- {}`);
      } else {
        lines.push(`${pad}- ${body[0]!.trim()}`);
        for (let i = 1; i < body.length; i++) lines.push(body[i]!);
      }
    }
  }
  return lines.join("\n") + "\n";
}

function writeMap(map: { [k: string]: YamlValue }, indent: number): string {
  const keys = Object.keys(map);
  if (keys.length === 0) return "{}\n";
  const pad = " ".repeat(indent);
  const lines: string[] = [];
  for (const key of keys) {
    const value = map[key]!;
    if (value === null || typeof value !== "object") {
      lines.push(`${pad}${key}: ${inlineScalar(value)}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`);
      } else {
        lines.push(`${pad}${key}:`);
        lines.push(writeList(value, indent + 2).replace(/\n$/, ""));
      }
    } else {
      const inner = value as { [k: string]: YamlValue };
      if (Object.keys(inner).length === 0) {
        lines.push(`${pad}${key}: {}`);
      } else {
        lines.push(`${pad}${key}:`);
        lines.push(writeMap(inner, indent + 2).replace(/\n$/, ""));
      }
    }
  }
  return lines.join("\n") + "\n";
}

function inlineScalar(v: YamlValue): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return writeScalar(v);
  // Nested object/array on a single line — fall back to JSON-ish.
  return JSON.stringify(v);
}

function writeScalar(s: string): string {
  // Quote if the string could be misread as a number/bool/null, contains
  // special chars, or leading/trailing whitespace.
  if (s === "" || /[:#\n\r\t]/.test(s) || s.startsWith(" ") || s.endsWith(" ")) {
    return JSON.stringify(s);
  }
  if (["null", "true", "false", "~", "Null", "NULL", "True", "TRUE", "False", "FALSE"].includes(s)) {
    return JSON.stringify(s);
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return JSON.stringify(s);
  if (s.startsWith("[") || s.startsWith("{") || s.startsWith("-") || s.startsWith("?") || s.startsWith("!") || s.startsWith("&") || s.startsWith("*") || s.startsWith("|") || s.startsWith(">") || s.startsWith("@") || s.startsWith("`") || s.startsWith('"') || s.startsWith("'")) {
    return JSON.stringify(s);
  }
  return s;
}
