/** Reserved target coordination entries never write through repository-owned links (§14). */
import { expect, test } from "bun:test";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { withTargetLocks } from "../../../src/agents/target-lock/index.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

for (const kind of ["symlink", "dangling", "hardlink"] as const) {
  test(`C-CONC-06 reserved owner ${kind} cannot overwrite its referent`, () => {
    const root = makeTempDir();
    const base = join(root, "skills");
    mkdirSync(base);
    const referent = join(root, "README.md");
    if (kind !== "dangling") writeFileSync(referent, "project bytes");
    const owner = join(base, ".crew-target.lock.owner");
    if (kind === "hardlink") linkSync(referent, owner);
    else symlinkSync(referent, owner);
    withTargetLocks([{ path: base, create: false }], () => {
      expect(existsSync(join(base, ".crew-target.lock"))).toBe(true);
    });
    if (kind === "dangling") expect(existsSync(referent)).toBe(false);
    else expect(readFileSync(referent, "utf8")).toBe("project bytes");
    expect(lstatSync(owner).isSymbolicLink()).toBe(false);
    expect(existsSync(join(base, ".crew-target.lock"))).toBe(false);
  });
}

for (const kind of ["symlink", "dangling", "directory"] as const) {
  test(`C-CONC-06 a reserved sentinel ${kind} is rejected without touching its referent`, () => {
    const root = makeTempDir();
    const base = join(root, "skills");
    mkdirSync(base);
    const sentinel = join(base, ".crew-target");
    const referent = join(root, "README.md");
    if (kind === "directory") mkdirSync(sentinel);
    else {
      if (kind === "symlink") writeFileSync(referent, "project bytes");
      symlinkSync(referent, sentinel);
    }
    expect(() => withTargetLocks([{ path: base, create: false }], () => {})).toThrow();
    if (kind === "symlink") expect(readFileSync(referent, "utf8")).toBe("project bytes");
    else expect(existsSync(referent)).toBe(false);
    expect(existsSync(join(base, ".crew-target.lock"))).toBe(false);
    expect(existsSync(join(base, ".crew-target.lock.owner"))).toBe(false);
  });
}

test("C-CONC-06 owner publication failure releases an empty acquired directory", () => {
  const base = makeTempDir();
  mkdirSync(join(base, ".crew-target.lock.owner"));
  expect(() => withTargetLocks([{ path: base, create: false }], () => {})).toThrow();
  expect(existsSync(join(base, ".crew-target.lock"))).toBe(false);
});
