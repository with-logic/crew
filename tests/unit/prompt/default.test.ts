/**
 * defaultPrompt and defaultChoicePrompt (§5.4) against a fake IO: answers,
 * defaults, and non-TTY behavior.
 */

import { describe, expect, test } from "bun:test";
import { defaultChoicePrompt, defaultPrompt, type PromptIO } from "../../../src/cli/prompt.ts";

/** Make a fake PromptIO that replays fixed bytes and captures stderr. */
function fakeIO(bytes: string, opts: { isTTY?: boolean; throwOnRead?: boolean } = {}) {
  const queued = Buffer.from(bytes, "utf8");
  let pos = 0;
  let stderr = "";
  const io: PromptIO = {
    isTTY: () => opts.isTTY ?? true,
    writeStderr: (s) => {
      stderr += s;
    },
    readByte: (buf) => {
      if (opts.throwOnRead) throw new Error("read failed");
      if (pos >= queued.length) return 0;
      buf[0] = queued[pos]!;
      pos++;
      return 1;
    },
  };
  return { io, stderr: () => stderr };
}

describe("defaultPrompt", () => {
  test("non-TTY returns abort without reading or writing", () => {
    const { io, stderr } = fakeIO("", { isTTY: false });
    expect(defaultPrompt("prompt? ", io)).toBe("abort");
    expect(stderr()).toBe("");
  });

  test("empty input (just enter) is yes", () => {
    const { io, stderr } = fakeIO("\n");
    expect(defaultPrompt("prompt? ", io)).toBe("yes");
    expect(stderr()).toBe("prompt? ");
  });

  test("`y` is yes; `yes` is yes; uppercase too", () => {
    expect(defaultPrompt("", fakeIO("y\n").io)).toBe("yes");
    expect(defaultPrompt("", fakeIO("yes\n").io)).toBe("yes");
    expect(defaultPrompt("", fakeIO("YES\n").io)).toBe("yes");
  });

  test("`n` and `no` are no", () => {
    expect(defaultPrompt("", fakeIO("n\n").io)).toBe("no");
    expect(defaultPrompt("", fakeIO("no\n").io)).toBe("no");
    expect(defaultPrompt("", fakeIO("N\n").io)).toBe("no");
  });

  test("garbage input is no", () => {
    expect(defaultPrompt("", fakeIO("wat\n").io)).toBe("no");
  });

  test("EOF with no bytes is abort", () => {
    expect(defaultPrompt("", fakeIO("").io)).toBe("abort");
  });

  test("read error with no bytes is abort", () => {
    expect(defaultPrompt("", fakeIO("", { throwOnRead: true }).io)).toBe("abort");
  });

  test("read error after partial bytes returns what was read", () => {
    expect(defaultPrompt("", fakeIO("y").io)).toBe("yes");
  });

  test("read error mid-line falls back to whatever was read", () => {
    // Three good bytes then a throw — exercises the catch branch with
    // chars already buffered ("yes" parses as yes after trim/lower).
    const queued = Buffer.from("yes", "utf8");
    let pos = 0;
    const io = {
      isTTY: () => true,
      writeStderr: () => {},
      readByte: (buf: Buffer) => {
        if (pos >= 3) throw new Error("read failed");
        buf[0] = queued[pos]!;
        pos++;
        return 1;
      },
    };
    expect(defaultPrompt("", io)).toBe("yes");
  });
});

describe("defaultChoicePrompt", () => {
  test("non-TTY returns abort without reading or writing", () => {
    const { io, stderr } = fakeIO("", { isTTY: false });
    expect(defaultChoicePrompt("pick? ", 3, io)).toBe("abort");
    expect(stderr()).toBe("");
  });

  test("empty input picks choice 0 (the default)", () => {
    expect(defaultChoicePrompt("", 3, fakeIO("\n").io)).toEqual({ kind: "choice", index: 0 });
  });

  test("`1` picks index 0; `3` picks index 2", () => {
    expect(defaultChoicePrompt("", 3, fakeIO("1\n").io)).toEqual({ kind: "choice", index: 0 });
    expect(defaultChoicePrompt("", 3, fakeIO("3\n").io)).toEqual({ kind: "choice", index: 2 });
  });

  test("out-of-range numbers abort", () => {
    expect(defaultChoicePrompt("", 3, fakeIO("0\n").io)).toBe("abort");
    expect(defaultChoicePrompt("", 3, fakeIO("4\n").io)).toBe("abort");
    expect(defaultChoicePrompt("", 3, fakeIO("-1\n").io)).toBe("abort");
  });

  test("non-numeric input aborts", () => {
    expect(defaultChoicePrompt("", 3, fakeIO("abc\n").io)).toBe("abort");
    expect(defaultChoicePrompt("", 3, fakeIO("y\n").io)).toBe("abort");
  });

  test("EOF with no bytes aborts", () => {
    expect(defaultChoicePrompt("", 3, fakeIO("").io)).toBe("abort");
  });
});
