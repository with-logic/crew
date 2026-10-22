/** Protected-byte and separately reported maintenance-lease inventories for PRD §11.2/§14. */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ByteInventory, Fixture } from "./types.ts";

export function inventory(fixture: Fixture): {
  protected: ByteInventory;
  coordination: ByteInventory;
} {
  const result: ByteInventory = {};
  const coordination: ByteInventory = {
    [relative(fixture.path, fixture.coordinationRoot)]: "absent",
  };
  const visit = (path: string): void => {
    const st = lstatSync(path, { throwIfNoEntry: false });
    const key = relative(fixture.path, path) || ".";
    const entries =
      path === fixture.coordinationRoot || path.startsWith(`${fixture.coordinationRoot}${sep}`)
        ? coordination
        : result;
    if (!st) entries[key] = "absent";
    else if (st.isSymbolicLink()) entries[key] = `link:${readlinkSync(path)}`;
    else if (st.isDirectory()) {
      entries[key] = `dir:${st.mode & 0o777}`;
      for (const name of readdirSync(path).sort()) visit(join(path, name));
    } else {
      const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
      entries[key] = `${st.mode & 0o777}:${digest}`;
    }
  };
  visit(fixture.path);
  return { protected: result, coordination };
}
