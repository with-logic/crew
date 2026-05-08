# Known Tap Registry

The bundled known-tap registry is generated from `known-taps/manifest.json` and
committed at `src/known-taps/generated.ts`.

Each manifest entry pins a tap source to a reviewed commit SHA. `trackingRef` is
only a human/automation hint for refreshing the pin; release builds must not
follow it. This keeps release artifacts deterministic even if an upstream
default branch moves between PR review and release.

There are two different update actions:

- **Regenerate the snapshot**: read the current pinned commits in
  `known-taps/manifest.json`, clone those exact commits, and rewrite
  `src/known-taps/generated.ts`. This is deterministic and safe to do during
  release.
- **Advance a pin**: inspect a newer upstream commit, decide that Homecrew still
  trusts that tap content, update the manifest's `commit`, and regenerate the
  snapshot. This changes what future Homecrew users may discover, so it should
  happen in a normal reviewed PR.

The practical implication: `bun run release` can keep the generated index fresh
with the reviewed manifest, but it will not pull new upstream skill changes by
itself. To ship upstream changes from a known tap, first merge a PR that updates
that tap's pinned `commit`.

To refresh the generated snapshot:

```sh
bun run known-taps build
bun run check
```

`bun run check` includes `known-taps check`, typecheck, lint, and the full test
suite, so CI and the release workflow fail if the generated snapshot is stale.

`bun run release` also runs `bun run known-taps build` on the release branch
before committing. That refreshes `src/known-taps/generated.ts` from the
reviewed manifest, but it does not advance manifest pins from `trackingRef`.
Refreshing pins should happen in a normal reviewed PR.

Routine workflows:

1. **Add a new known tap**: run
   `bun run known-taps add <name> <url> --description "..."`, review the
   resolved pin and generated snapshot, then open a PR. The command defaults to
   `--tracking-ref main`, `--subpath ""`, and `--trust curated`; pass explicit
   flags when a source needs different values.
2. **Pick up new skills from an existing known tap**: update only that entry's
   `commit` after reviewing the upstream diff, then open a PR. Use
   `bun run known-taps update <tap-name> [<tap-name>...]` to resolve each
   selected tap's `trackingRef`, update the manifest pin, and regenerate
   `src/known-taps/generated.ts`. Use `bun run known-taps update --all` to
   refresh every manifest entry that has a `trackingRef`.
3. **Cut a Homecrew release**: run `bun run release`; it regenerates the
   snapshot from already-reviewed pins as part of the release PR.

Adding a tap source:

```json
{
  "name": "example",
  "url": "https://github.com/example/agent-skills.git",
  "subpath": "",
  "description": "Example workflows.",
  "trust": "curated",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "trackingRef": "main"
}
```

Use `trust: "official"` only when the tap is published by the owner of the tool
or service the tap represents. Use `trust: "curated"` when Homecrew maintainers
reviewed and selected it.
