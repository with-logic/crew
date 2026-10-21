/** Case-insensitive safe query keys remain readable in free-text diagnostics (§5.2, §13, C-REF-28). */

import { expect, test } from "bun:test";
import { displayText } from "../../src/refs/display-url.ts";
import { redactText } from "../../src/util/redact.ts";

test.each([
  "VERSION=1&REF=main&SERVICE=git",
  "VeRsIoN=1&rEf=main&SeRvIcE=git",
  "%56ersion=1&%52ef=main&%53ervice=git",
])("C-REF-28 direct diagnostics preserve allowlisted query keys: %s", (query) => {
  for (const source of ["/repo", "https://host/repo"]) {
    const diagnostic = `fetched '${source}?${query}': revision available`;
    expect(displayText(diagnostic)).toBe(diagnostic);
    expect(redactText(diagnostic)).toBe(diagnostic);
  }
});
