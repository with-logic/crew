#!/usr/bin/env bun
/**
 * Program entry point. Reads argv, hands off to `runCli`, and exits with
 * the returned code. Everything interesting happens in `./cli/main.ts`.
 */

import { runCli } from "./cli/main.ts";

const argv = process.argv.slice(2);
const code = runCli(argv);
process.exit(code);
