/** Canonical clone identities preserve case and keep secrets out of names (§6). */

import { expect, test } from "bun:test";
import { repoDirName, sameRepoUrl } from "../../../src/core/repo-path.ts";
import { canonicalRepoUrl } from "../../../src/core/repo-url.ts";

test("C-TAP-28 credentials and repository paths retain case in clone identity", () => {
  expect(canonicalRepoUrl("HTTPS://Alice:Token@EXAMPLE.COM/Acme/Skills.git/")).toBe(
    "https://Alice:Token@example.com/Acme/Skills",
  );
  expect(canonicalRepoUrl("HTTPS://User@EXAMPLE.COM?token=AbCd#Frag")).toBe(
    "https://User@example.com?token=AbCd#Frag",
  );
  expect(sameRepoUrl("https://Alice@example.com/repo", "https://alice@example.com/repo")).toBe(
    false,
  );
  expect(repoDirName("ssh://Alice@EXAMPLE.COM/Acme/Skills.git")).not.toBe(
    repoDirName("ssh://alice@example.com/Acme/Skills.git"),
  );
  expect(repoDirName("git@example.com:Acme/Skills.git")).toBe(
    repoDirName("git@EXAMPLE.COM:Acme/Skills/"),
  );
});

test("C-TAP-28 readable clone prefixes exclude credentials and query secrets", () => {
  const name = repoDirName(
    "https://SecretUser:SecretPassword@EXAMPLE.COM/team/repo.git?token=QuerySecret#FragmentSecret",
  );
  expect(name).toMatch(/^example-com-team-repo-git-[a-f0-9]{64}$/);
  for (const secret of ["secretuser", "secretpassword", "querysecret", "fragmentsecret"]) {
    expect(name).not.toContain(secret);
  }
  expect(repoDirName("ssh://SecretUser@example.com")).toMatch(/^example-com-[a-f0-9]{64}$/);
  expect(repoDirName("")).toMatch(/^repo-[a-f0-9]{64}$/);
});

test("C-TAP-28 long readable prefixes fit within a filesystem component", () => {
  const name = repoDirName(`https://example.com/${"a".repeat(200)}/${"b".repeat(200)}`);
  expect(name).toHaveLength(225);
  expect(name).toMatch(/^[a-z0-9-]{160}-[a-f0-9]{64}$/);
});
