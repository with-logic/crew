/**
 * Homepage command reference data (§16.6): the "Discovery" group.
 */
import type { CommandGroup } from "../Commands.types";

export const DISCOVERY: CommandGroup = {
  id: "cmd-discovery",
  label: "Discovery",
  commands: [
    {
      name: "search",
      signature: <>crew search [--tap &lt;name&gt;] [&lt;query&gt;]</>,
      description: (
        <>
          Case-insensitive substring match across every configured tap, or just one with{" "}
          <code>--tap</code>. With no query, lists every installable skill — installed ones are
          marked <code>✓</code>. With a query, also suggests matching trusted taps to add.
        </>
      ),
    },
    {
      name: "tap-add",
      signature: <>crew tap add [--recursive] &lt;url-or-path&gt; [name]</>,
      description: (
        <>
          Add a registry from a git source or local folder. Name defaults to the repo/path name.
          Recursive discovery is opt-in for trusted non-standard layouts.
        </>
      ),
    },
    {
      name: "tap-remove",
      signature: <>crew tap remove &lt;name&gt;</>,
      description: "Delete a local tap clone and drop it from config.",
    },
    {
      name: "tap-list",
      signature: <>crew tap list</>,
      description:
        "Print each tap's name, kind/status, source target, recursive discovery marker when set, and last-fetched timestamp for git taps.",
    },
    {
      name: "taps",
      signature: <>crew taps</>,
      description: ["Alias for ", <code key="crew-tap-list">crew tap list</code>, "."],
    },
    {
      name: "untap",
      signature: <>crew untap &lt;name&gt;</>,
      description: ["Alias for ", <code key="crew-untap-tap-remove">crew tap remove</code>, "."],
    },
    {
      name: "tap-update",
      signature: <>crew tap update [&lt;name&gt;…]</>,
      description:
        "Fetch + fast-forward every git tap (or the named subset). Doesn't touch installed skills.",
    },
  ],
};
