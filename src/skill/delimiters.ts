/** Incremental frontmatter delimiter recognition for strings and ASCII read buffers (§9 step 4). */

export const CARRIAGE_RETURN = 13;
export const LINE_FEED = 10;
const DASH = 45;
type FinalizedDelimiterScan =
  | { readonly kind: "missing" }
  | { readonly kind: "unclosed" }
  | {
      readonly kind: "complete";
      readonly headerStart: number;
      readonly headerEnd: number;
      readonly bodyStart: number;
    };

type ScanInput = string | Uint8Array;

/** Track only delimiter candidates; incomplete or malformed headers retain no source bytes. */
export class FrontmatterDelimiterScanner {
  kind: "pending" | "missing" | "unclosed" | "complete";
  headerStart = 0;
  headerEnd = 0;
  bodyStart = 0;
  lineEndingCharactersInLastWrite = 0;
  private position = 0;
  private lineStart = 0;
  private previousBreak = 0;
  private opened = false;
  private dashes = 0;
  private trailingSpace = false;
  private invalid = false;
  private afterCr = false;

  constructor() {
    this.kind = "pending";
  }

  /** Consume decoded text or ASCII bytes; stop at the closing delimiter's first line ending. */
  write(input: ScanInput): void {
    this.lineEndingCharactersInLastWrite = 0;
    for (let i = 0; i < input.length; i++, this.position++) {
      const char = typeof input === "string" ? input.charCodeAt(i) : input[i]!;
      if (char === CARRIAGE_RETURN || char === LINE_FEED) {
        this.lineEndingCharactersInLastWrite++;
        if (this.afterCr && char === LINE_FEED) {
          // The CR already finished the line; its following LF belongs to that same boundary.
          if (this.headerStart === this.lineStart) this.headerStart++;
          this.lineStart++;
          this.afterCr = false;
          continue;
        }
        this.finishLine(this.position, this.position + 1);
        if (this.kind !== "pending") return;
        this.afterCr = char === CARRIAGE_RETURN;
      } else {
        this.afterCr = false;
        if (this.invalid) {
          // Once invalid, no later character on this line can make it a delimiter.
          let next = i + 1;
          while (next < input.length) {
            const nextChar = typeof input === "string" ? input.charCodeAt(next) : input[next]!;
            if (nextChar === CARRIAGE_RETURN || nextChar === LINE_FEED) break;
            next++;
          }
          this.position += next - i - 1;
          i = next - 1;
        } else if (
          char === 9 ||
          char === 11 ||
          char === 12 ||
          char === 32 ||
          char === 0xa0 ||
          char === 0x1680 ||
          (char >= 0x2000 && char <= 0x200a) ||
          char === 0x2028 ||
          char === 0x2029 ||
          char === 0x202f ||
          char === 0x205f ||
          char === 0x3000 ||
          char === 0xfeff
        ) {
          this.trailingSpace ||= this.dashes > 0;
        } else if (char === DASH && this.dashes < 3 && !this.trailingSpace) this.dashes++;
        else {
          if (!this.opened) {
            this.kind = "missing";
            return;
          }
          this.invalid = true;
        }
      }
    }
  }

  /** Treat EOF as a final line boundary, without introducing a byte into the source. */
  end(): FinalizedDelimiterScan {
    if (this.kind === "pending") this.finishLine(this.position, this.position);
    if (this.kind === "complete") {
      return {
        kind: "complete",
        headerStart: this.headerStart,
        headerEnd: this.headerEnd,
        bodyStart: this.bodyStart,
      };
    }
    const kind = this.kind === "pending" ? (this.opened ? "unclosed" : "missing") : this.kind;
    this.kind = kind;
    if (kind === "missing") return { kind };
    return { kind };
  }

  private finishLine(end: number, next: number): void {
    const delimiter = this.dashes === 3 && !this.invalid;
    if (this.opened && delimiter) {
      this.headerEnd = Math.max(this.headerStart, this.previousBreak);
      this.bodyStart = next;
      this.kind = "complete";
      return;
    }
    if (!this.opened && this.dashes !== 0) {
      if (!delimiter) {
        this.kind = "missing";
        return;
      }
      this.opened = true;
      this.headerStart = next;
    }
    this.previousBreak = end;
    this.lineStart = next;
    this.dashes = 0;
    this.trailingSpace = false;
    this.invalid = false;
  }
}
