#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { install, parseHomeArgument, uninstall } from "../scripts/config.mjs";

const usage = `Usage: pingpang-hook [install|uninstall] [--home <directory>]

Commands:
  install       Install or update the Codex and Claude Code hooks (default)
  uninstall     Remove only the hooks managed by PingPang Hook

Options:
  --home <dir>  Use an alternate home directory (useful for testing)
  -h, --help    Show this help message
`;

const argv = process.argv.slice(2);
let [command = "install", ...args] = argv;

if (command === "-h" || command === "--help") {
  process.stdout.write(usage);
  process.exit(0);
}

// Allow `pingpang-hook --home /tmp/example` as shorthand for install.
if (command.startsWith("-")) {
  args = argv;
  command = "install";
}

if (command !== "install" && command !== "uninstall") {
  process.stderr.write(`${usage}\n`);
  process.exit(64);
}

try {
  const home = parseHomeArgument(args);
  if (command === "uninstall") {
    const result = await uninstall({ home });
    process.stdout.write(result.updated.length
      ? `Updated: ${result.updated.join(", ")}\n`
      : "No PingPang Hook entries found.\n");
  } else {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const result = await install({
      home,
      sourceScript: join(currentDir, "pingpang-sound")
    });
    process.stdout.write(`Installed notifier: ${result.scriptPath}\n`);
    if (result.blacklistCreated) process.stdout.write(`Created blacklist: ${result.blacklistPath}\n`);
    process.stdout.write(result.updated.length
      ? `Updated: ${result.updated.join(", ")}\n`
      : "Hooks already installed.\n");
  }
} catch (error) {
  process.stderr.write(`pingpang-hook: ${error.message}\n`);
  process.exitCode = 1;
}
