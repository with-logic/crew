# Security Policy

## Reporting a Vulnerability

Please report security issues privately by emailing security@logic.inc.

Do not open a public GitHub issue for a suspected vulnerability. Include as
much of the following as you can:

- The affected `crew` version or commit.
- Your macOS version and CPU architecture.
- The command or workflow that exposes the issue.
- Reproduction steps, proof of concept, or relevant logs.
- Impact: what an attacker could read, write, execute, or cause a user to trust.

We will review the report, follow up if we need more detail, and coordinate a
fix and disclosure timeline.

## Scope

Security reports are especially useful for:

- Installer or self-update issues, including release artifact integrity.
- A way for a tap, skill, or repository to make `crew` execute code during
  install, update, search, or uninstall.
- A way for `crew` to overwrite files it did not create.
- A way to escape the intended `~/.crew/` or agent skills directories.
- Vulnerabilities in release, checksum, or update metadata.
- Leaks of local filesystem paths, credentials, private tap contents, or other
  user data.

Normal bugs, feature requests, docs fixes, and support questions can use GitHub
issues.

## Supported Versions

Security fixes target the latest released version and the current `main`
branch. Older releases may be fixed when the risk justifies it, but users should
expect to upgrade with `crew self-update`.
