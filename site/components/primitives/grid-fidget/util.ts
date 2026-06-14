/*
 * Shared canvas helpers for the site-only background fidget.
 * This visual layer does not implement a CLI PRD section.
 */

export const CELL_SIZE = 18;

export function snapToGrid(value: number, offset: number): number {
  return Math.floor((value - offset) / CELL_SIZE) * CELL_SIZE + offset;
}

export function colorWithAlpha(color: string, alpha: number): string {
  const key = color;
  const cached = COLOR_CACHE.get(key);
  const parsed = cached === undefined ? parseAndCacheColor(key) : cached;
  if (!parsed) return color;
  const nextAlpha = clamp(alpha) * parsed.alpha;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${nextAlpha})`;
}

type Rgba = {
  readonly alpha: number;
  readonly b: number;
  readonly g: number;
  readonly r: number;
};

const COLOR_CACHE = new Map<string, Rgba | null>();

function parseAndCacheColor(color: string): Rgba | null {
  const parsed = parseColor(color);
  COLOR_CACHE.set(color, parsed);
  return parsed;
}

function parseColor(color: string): Rgba | null {
  if (color.startsWith("#")) return parseHex(color);
  if (color.toLowerCase().startsWith("rgb")) return parseRgb(color);
  return null;
}

function parseHex(color: string): Rgba | null {
  const hex = color.slice(1);
  if (![3, 4, 6, 8].includes(hex.length) || /[^0-9a-f]/i.test(hex)) return null;
  const expanded = hex.length <= 4 ? [...hex].map((part) => part + part).join("") : hex;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgb(color: string): Rgba | null {
  const raw = color.match(/^rgba?\((.*)\)$/i)?.[1];
  if (!raw) return null;
  const normalized = raw.replace(/\s*\/\s*/, " / ");
  const parts = normalized.includes(",") ? normalized.split(/\s*,\s*/) : normalized.split(/\s+/);
  const slash = parts.indexOf("/");
  const alpha = slash === -1 ? parts[3] : parts[slash + 1];
  const [r, g, b] = parts;
  if (r === undefined || g === undefined || b === undefined) return null;
  return {
    r: Number.parseFloat(r),
    g: Number.parseFloat(g),
    b: Number.parseFloat(b),
    alpha: alpha === undefined ? 1 : parseAlpha(alpha),
  };
}

function parseAlpha(value: string): number {
  return value.endsWith("%")
    ? clamp(Number.parseFloat(value) / 100)
    : clamp(Number.parseFloat(value));
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
