# Secret scanning

The **Secret scan** check runs native, MIT-licensed Gitleaks 8.30.1 on PRs,
branch/tag pushes, merge queues, and manual runs. Findings and scanner errors
fail the check. Require this check in branch protection while preserving existing
requirements. Gitleaks recognizes credential patterns; it does not verify whether
a match is a live, private secret.

PRs scan base-to-head history, so adding a credential and deleting it in a later
commit still fails. Pushes scan the pushed range when the previous commit is
available; new refs and manual runs scan history reachable from the selected head.
Ignored and untracked local files such as `.env` are outside the scan. A
force-added or previously tracked `.env` is Git content and is checked.

Image preparation and checkout happen before scanning. The scan runs with
networking disabled, a read-only source mount, and no service credentials. No
Gitleaks account or license signup is needed. A separate `pull_request_target`
run uses trusted workflow code to scan PR data and comment on findings/errors,
including fork PRs. It never runs project scripts, dependencies, or local actions.
These comments start after the workflow reaches the default branch. They link to
redacted metadata in the run log and never include detected values.

## Investigate a finding

The log shows the rule, file/line, introducing commit, and **Ignore ID**. Inspect
the reported location privately; do not paste possible credentials into PRs,
Slack, or issues.

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
changes need trusted human review, just like workflow changes; the required
check does not technically enforce exception approval.

For one historical finding, copy its complete Ignore ID into `.gitleaksignore`,
one per line, with the reason and review reference on a separate comment line:

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

## Local staged scans

Install the native CLI once, then scan only the Git index. Homebrew installs
its current version; use the [official 8.30.1 release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)
when exact parity with CI is needed:

```sh
brew install gitleaks
GIT_CONFIG_PARAMETERS="${GIT_CONFIG_PARAMETERS:+$GIT_CONFIG_PARAMETERS }'color.ui=false' 'color.diff=false'" \
gitleaks git --pre-commit --staged --redact=100
```

The native scan needs no network access. Disabling Git color prevents the 8.30.1
diff parser from silently missing staged content. The [shared Utils hooks](https://github.com/with-logic/utils/tree/main/githooks)
add this scan to existing linting in participating checkouts; follow their setup
instructions to configure them. This change does not install a hook here, so
run the staged command manually until one is configured.
See the [rollout dashboard](https://github.com/with-logic/pipeline/issues/121)
and [shared scanning guide](https://github.com/with-logic/pipeline/blob/main/docs/secret-scanning.md)
for the organization-wide six-hour history sweep and Slack activation status.
