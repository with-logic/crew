/** Shared terminal-control metadata fixtures for human output tests (§5.1, §9). */

export const rawMetadata = "safe\x1b[31m\x85\x07\x7f\nend";
export const escapedMetadata = "safe\\x1b[31m\\x85\\x07\\x7f\\x0aend";
export const yamlMetadata = '"safe\\x1b[31m\\x85\\x07\\x7f\\nend"';
