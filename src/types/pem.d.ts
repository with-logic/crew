/**
 * Declares text imports for PEM release assets (§10.3).
 */

declare module "*.pem" {
  const content: string;
  // biome-ignore lint/style/noDefaultExport: Bun text imports expose file contents as default.
  export default content;
}
