/** Recursive discovery survives concurrent same-source registration (§14, §16.5). */
import { expect, test } from "bun:test";
import { defaultConfig } from "../../src/config/defaults.ts";
import { mergeAutoTaps } from "../../src/install/config-merge.ts";

for (const scenario of ["standard", "recursive", "different source"] as const) {
  test(`C-CONC-01 concurrent registration ${scenario} preserves its row and intended discovery`, () => {
    const before = { ...defaultConfig(), taps: [] };
    const resolved = {
      name: "mytap",
      kind: "path" as const,
      registered: false,
      url: "",
      subpath: "",
      path: "/tmp/source-a",
      discovery: "recursive" as const,
    };
    const concurrent = {
      ...resolved,
      registered: true,
      path: scenario === "different source" ? "/tmp/source-b" : resolved.path,
      ...(scenario === "recursive"
        ? { discovery: "recursive" as const }
        : { discovery: undefined }),
    };
    const { discovery, ...base } = concurrent;
    const tap = discovery === undefined ? base : { ...base, discovery };
    const fresh = { ...before, taps: [tap] };
    const merged = mergeAutoTaps(fresh, before, { ...before, taps: [resolved] });
    expect(merged.taps[0]!.registered).toBe(true);
    expect(merged.taps[0]!.path).toBe(concurrent.path);
    if (scenario === "different source") {
      expect(merged).toBe(fresh);
      expect(merged.taps[0]!.discovery).toBeUndefined();
    } else expect(merged.taps[0]!.discovery).toBe("recursive");
    if (scenario === "recursive") expect(merged).toBe(fresh);
  });
}
