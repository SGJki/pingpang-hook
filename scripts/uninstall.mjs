import { parseHomeArgument, uninstall } from "./config.mjs";

const result = await uninstall({ home: parseHomeArgument(process.argv.slice(2)) });
console.log(result.updated.length ? `Updated: ${result.updated.join(", ")}` : "No PingPang Hook entries found.");
