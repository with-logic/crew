/**
 * Unit tests for the default synchronous prompt (§16.4).
 *
 * The prompt is the TTY-backed seam everyday production runs hit. The
 * CLI tests exercise the install command's prompt hook via an injected
 * PromptFn stub — these tests cover the real stdin/stderr read path
 * through a PromptIO seam.
 */

import { describe, expect, test } from "bun:test";
import { defaultChoicePrompt, defaultPrompt, type PromptIO, realIO } from "../../src/cli/prompt.ts";

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

describe("defaultPrompt real IO seam", () => {
  // These tests drive each `realIO` method in isolation — we don't
  // call `defaultPrompt()` without a stub IO, because that would
  // invoke `readSync(0, ...)` on the real stdin and block when the
  // suite is run from an interactive terminal.

  test("realIO.isTTY mirrors process.stdin.isTTY", () => {
    const orig = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    try {
      expect(realIO.isTTY()).toBe(true);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: orig, configurable: true });
    }
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    try {
      expect(realIO.isTTY()).toBe(false);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: orig, configurable: true });
    }
  });

  test("realIO.writeStderr writes to process.stderr", () => {
    const origWrite = process.stderr.write.bind(process.stderr);
    let captured = "";
    (process.stderr as { write: (s: string) => boolean }).write = (s: string) => {
      captured += s;
      return true;
    };
    try {
      realIO.writeStderr("hello ");
      expect(captured).toBe("hello ");
    } finally {
      (process.stderr as { write: (s: string) => boolean }).write = origWrite as unknown as (
        s: string,
      ) => boolean;
    }
  });

  test("realIO.readByte reads from the given fd (EOF on an empty file)", () => {
    const { openSync, closeSync, writeFileSync, mkdtempSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "crew-prompt-"));
    const empty = join(dir, "empty");
    writeFileSync(empty, "");
    const fd = openSync(empty, "r");
    try {
      const buf = Buffer.alloc(1);
      expect(realIO.readByte(buf, fd)).toBe(0);
    } finally {
      closeSync(fd);
    }
    const withByte = join(dir, "one");
    writeFileSync(withByte, "y");
    const fd2 = openSync(withByte, "r");
    try {
      const buf = Buffer.alloc(1);
      expect(realIO.readByte(buf, fd2)).toBe(1);
      expect(buf.toString("utf8", 0, 1)).toBe("y");
    } finally {
      closeSync(fd2);
    }
  });

  test("defaultPrompt with realIO short-circuits to abort when stdin is not a TTY", () => {
    const orig = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    try {
      // isTTY: false → returns abort immediately without calling readByte.
      // Safe to run against the real realIO because no read happens.
      expect(defaultPrompt("nope", realIO)).toBe("abort");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: orig, configurable: true });
    }
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
