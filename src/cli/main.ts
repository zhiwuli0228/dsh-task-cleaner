#!/usr/bin/env node
import { createDemoPorts } from "./demo-ports.js";
import { runCliEntry, type CliContext } from "./execute.js";

/**
 * CLI entry point (framework baseline).
 *
 * The port provider is a demo stub until the composition root wires
 * backend use-cases; command parsing/execution is fully testable without
 * this file.
 */

const context: CliContext = {
  ports: createDemoPorts(),
  isTty: Boolean(process.stdout.isTTY),
  cliVersion: "0.1.2-rc.1.dev",
};

async function main(): Promise<void> {
  const output = await runCliEntry(process.argv.slice(2), context);
  if (output.stdout) process.stdout.write(output.stdout);
  if (output.stderr) process.stderr.write(output.stderr);
  process.exitCode = output.exitCode;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[ERR_CLI] ${message}\n`);
  process.exitCode = 1;
});
