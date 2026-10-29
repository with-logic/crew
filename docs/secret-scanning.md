# Secret scanning

The **Secret scan** check runs native, MIT-licensed Gitleaks 8.30.1 on PRs,
branch/tag pushes, merge queues, and manual runs. PR, merge-queue, and pushed
commit-range scans report failure on findings. Non-publication full-history
audits temporarily warn while historical findings are reviewed. Scanner, Git,
and configuration errors fail the job. Secret-scan results are advisory for
merging to `main`; publication gates remain blocking. Gitleaks recognizes
credential patterns; it does not verify whether a match is a live, private secret.

PRs scan base-to-head history, so adding a credential and deleting it in a later
commit still fails. Pushes scan the pushed range. First pushes to non-default
branches scan from the merge base with the fetched default branch, excluding inherited history.
Missing required bases fail. New tags, first default-branch pushes, and manual
runs scan history reachable from the selected head.
Ignored and untracked local files such as `.env` are outside the scan. A
force-added or previously tracked `.env` is Git content and is checked.

Image preparation and checkout happen before scanning. The scan runs with
networking disabled, a read-only source mount, and no service credentials. No
Gitleaks account or license signup is needed. A separate `pull_request_target`
run uses trusted workflow code to scan PR data and comment on findings/errors,
including fork PRs. It never runs project scripts, dependencies, or local actions.
These comments start after the workflow reaches the default branch. They link to
rule, introducing commit, and line metadata. Detected values, raw paths, and
Ignore IDs are omitted from public output.

## Investigate a finding

The public log shows the rule, introducing commit, and line. Run native Gitleaks
privately at that commit for the full path and **Ignore ID**; native redaction
does not hide those fields. Inspect findings privately; do not paste possible
credentials into PRs, Slack, or issues.

- **Real credential:** revoke or rotate it if exposed, replace it with an
  environment-variable or secret-store reference, and remove it from every
  introducing PR commit. Coordinate rewriting shared history with the owner;
  deletion or a history rewrite does not replace rotation.
- **Confirmed public, placeholder, or test value:** document why it is safe and
  obtain review for a narrow native exception below. Do not baseline untriaged
  historical matches to make CI green.
- **Scanner error:** repair the checkout/history, image/runtime, or configuration
  problem and rerun. No clean result was obtained; an exception is not a repair.

## Per-repository exceptions

Each repo owns its root `.gitleaks.toml` and `.gitleaksignore`. Native Gitleaks
reads policy from the scanned checkout, including inline `gitleaks:allow`
comments. A proposed exception can therefore affect its own PR scan. These
changes need trusted human review, just like workflow changes; the scan does not
technically enforce exception approval.

For one historical finding, copy its complete Ignore ID from a private local scan
into `.gitleaksignore`, one per line, with the reason and review reference on a
separate comment line:

```text
# Generated frontend demo value; reviewed in <review link>.
<commit>:<path>:<rule>:<line>
```

This is a finding fingerprint, not a file hash or
whole-file exclusion. Rebase/history changes or a new introduction can produce a
different ID.

For recurring verified public/test data, preserve default rules and allow only
the complete approved value for each matching rule:

```toml
[extend]
useDefault = true

[[allowlists]]
description = "Public fixture; reviewed by <reviewer> in <review link>, <date>"
targetRules = ["generic-api-key"]
regexTarget = "secret"
regexes = ['^public-example-value$']
```

Escape regex metacharacters in the approved value and avoid wildcards or broad
file exclusions. A replacement value remains checked. Preserve existing config
when adding an exception; exceptions apply only to this repository.

## Release publication

Release publication first scans the full history of the event-selected commit
for main pushes, tag pushes, and manual runs. The build checks out that exact
scanned commit before creating tags, signing binaries, or publishing the GitHub
release. Findings and scanner errors block publication.

## Local Git hook

Use local staged scans only with trusted staged changes; native Git diff may
invoke an already configured textconv driver.

Install native Gitleaks once and activate this checkout's hooks from the
repository root. Homebrew installs its current formula; use the
[official 8.30.1 release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)
for exact CI parity, and verify the installed version:

Before setting `core.hooksPath`, inspect your active hooks (`git config --get
core.hooksPath`, or the default `.git/hooks`). Setting it to `.githooks` replaces
that hook directory. Migrate or chain existing hooks, or add
`./.githooks/scan-secrets` to your existing `prepare-commit-msg` instead, before
activating these hooks.

```sh
brew install gitleaks
gitleaks version
git config core.hooksPath .githooks
```

To run the staged check manually, use `./.githooks/scan-secrets`.

The `prepare-commit-msg` hook scans staged changes after any normal pre-commit
checks. `--no-verify` skips those pre-commit checks but still runs the scan.
The scanner runs offline and never downloads tools during a commit. Ignored
`.env` files, untracked files, and unstaged edits are excluded. Partially staged
files are checked using their staged changes; force-added credentials are checked.
Findings, a missing Gitleaks binary, and scanner errors block the commit.

Stage root `.gitleaks.toml` and `.gitleaksignore` changes before committing;
untracked policy files or unstaged policy changes block the scan. The reviewed,
per-repository native exceptions above also apply to local scans. Quotes in
hook output are display delimiters: copy a normal `ignore-id` into
`.gitleaksignore` without those quotes. Prefer an exact-value TOML exception
for recurring public/test fixtures.

The hook scans text presented by native Git diff. Git attributes can mark paths
as binary or apply textconv, changing what the hook sees. The separate CI commit
scan forces text and disables textconv. See the
[shared guide](https://github.com/with-logic/pipeline/blob/main/docs/secret-scanning.md)
for remediation and native exceptions.
