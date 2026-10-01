/**
 * Homepage command reference data (§16.6): the "Meta" group.
 */
import type { CommandGroup } from "../Commands.types";

export const META: CommandGroup = {
  id: "cmd-meta",
  label: "Meta",
  commands: [
    {
      name: "help",
      signature: <>crew help [&lt;command&gt;]</>,
      description:
        "Overview or per-command help, with realistic examples. `crew <command> --help` and `-h` work too.",
    },
    {
      name: "version",
      signature: <>crew version</>,
      description: "Print the version string. `crew --version`, `-v`, and `-V` work too.",
    },
  ],
};
