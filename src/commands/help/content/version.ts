import type { CommandHelp } from "./types.ts";

export const versionHelp: CommandHelp = {
  name: "version",
  synopsis: "crew version",
  summary: ["Print the Homecrew version. `crew --version`, `crew -v`, and `crew -V` do the same."],
};
