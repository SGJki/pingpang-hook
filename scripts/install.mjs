import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { install, parseHomeArgument } from "./config.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const home = parseHomeArgument(process.argv.slice(2));
const result = await install({ home, sourceScript: join(currentDir, "..", "bin", "pingpang-sound") });

console.log(`Installed notifier: ${result.scriptPath}`);
if (result.blacklistCreated) console.log(`Created blacklist: ${result.blacklistPath}`);
console.log(result.updated.length ? `Updated: ${result.updated.join(", ")}` : "Hooks already installed.");
