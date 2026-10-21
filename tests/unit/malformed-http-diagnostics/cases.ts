/** Malformed HTTP separator and control cases for display-only conformance (§13, C-CLI-06c). */

export const SECRET = "MALFORMED_HTTP_SECRET";
export const SUFFIX = "PRIVATE_SUFFIX";
const authority = `${SECRET}@host.invalid/o/r`;

export const MALFORMED_URLS = [
  ...["http", "https", "HtTpS"].flatMap((scheme) =>
    ["", "/", "\\", "/\\", "\\/", "\\\\", "\\\\\\", "/\\/"].map(
      (separator) => `${scheme}:${separator}${authority}`,
    ),
  ),
  `https:${SECRET} 'quoted'@host.invalid/o/r`,
  `https:${SECRET}<markup>@host.invalid/o/r`,
  `https : /${authority}`,
  `https: / \\${authority}`,
  `https:\\${SECRET}?version=1@host.invalid/o/r`,
  `https:\\${SECRET}#fragment@host.invalid/o/r`,
];

export const CONTROL_UNITS: readonly string[] = Array.from({ length: 65 }, (_, i) => {
  const code = i < 32 ? i : i + 95;
  return String.fromCharCode(code);
}).flatMap((raw) => [raw, `\\x${raw.charCodeAt(0).toString(16).padStart(2, "0")}`]);

export function controlledUrls(control: string): readonly string[] {
  return [
    `ht${control}tps:\\${authority}`,
    `https${control}:\\${authority}`,
    `https:${control}\\${authority}`,
    `https:/${control}\\${authority}`,
    `https:${SECRET}${control}MORE@host.invalid/o/r`,
  ];
}
