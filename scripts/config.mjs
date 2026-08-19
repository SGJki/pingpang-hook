import { chmod, copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const INSTALL_DIR_NAME = ".pingpang-hook";
export const SCRIPT_NAME = "pingpang-sound";
const SCRIPT_TOKEN = `${INSTALL_DIR_NAME}/bin/${SCRIPT_NAME}`;

export function parseHomeArgument(argv) {
  const homeIndex = argv.indexOf("--home");
  if (homeIndex === -1) return process.env.HOME;
  const value = argv[homeIndex + 1];
  if (!value || value.startsWith("-")) throw new Error("--home requires a directory path");
  return resolve(value);
}

export function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function commandFor(scriptPath, event) {
  return `${shellQuote(scriptPath)} ${event}`;
}

function isOurHandler(handler) {
  return handler?.type === "command" && typeof handler.command === "string" && handler.command.includes(SCRIPT_TOKEN);
}

function removeOurHooks(config) {
  if (!config.hooks || typeof config.hooks !== "object" || Array.isArray(config.hooks)) return false;

  let changed = false;
  for (const event of ["PermissionRequest", "Stop"]) {
    if (!Array.isArray(config.hooks[event])) continue;
    const nextGroups = [];
    for (const group of config.hooks[event]) {
      if (!group || typeof group !== "object" || !Array.isArray(group.hooks)) {
        nextGroups.push(group);
        continue;
      }
      const hooks = group.hooks.filter((handler) => !isOurHandler(handler));
      if (hooks.length !== group.hooks.length) changed = true;
      if (hooks.length > 0) nextGroups.push({ ...group, hooks });
      else changed = true;
    }
    if (nextGroups.length > 0) config.hooks[event] = nextGroups;
    else delete config.hooks[event];
  }
  if (Object.keys(config.hooks).length === 0) delete config.hooks;
  return changed;
}

function addHook(config, event, scriptPath) {
  config.hooks ??= {};
  if (!Array.isArray(config.hooks[event])) config.hooks[event] = [];
  if (config.hooks[event].some((group) => Array.isArray(group?.hooks) && group.hooks.some(isOurHandler))) return false;

  config.hooks[event].push({
    hooks: [{ type: "command", command: commandFor(scriptPath, event === "Stop" ? "complete" : "approval"), timeout: 3 }]
  });
  return true;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(path) {
  if (!(await exists(path))) return {};
  try {
    const content = await readFile(path, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("root must be an object");
    return parsed;
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${error.message}`);
  }
}

async function writeJson(path, config) {
  await mkdir(dirname(path), { recursive: true });
  if (await exists(path)) {
    const backup = `${path}.pingpang-hook.bak`;
    if (!(await exists(backup))) await copyFile(path, backup);
  }
  const temporary = `${path}.pingpang-hook.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function configPaths(home) {
  return {
    codex: join(home, ".codex", "hooks.json"),
    claude: join(home, ".claude", "settings.json")
  };
}

export async function install({ home, sourceScript }) {
  if (!home) throw new Error("HOME is not set; pass --home <directory>");
  const installDir = join(home, INSTALL_DIR_NAME);
  const scriptPath = join(installDir, "bin", SCRIPT_NAME);
  await mkdir(dirname(scriptPath), { recursive: true });
  await copyFile(sourceScript, scriptPath);
  await chmod(scriptPath, 0o755);

  const updated = [];
  for (const [name, path] of Object.entries(configPaths(home))) {
    const config = await readJson(path);
    const approvalAdded = addHook(config, "PermissionRequest", scriptPath);
    const completionAdded = addHook(config, "Stop", scriptPath);
    if (approvalAdded || completionAdded) {
      await writeJson(path, config);
      updated.push(name);
    }
  }
  return { scriptPath, updated };
}

export async function uninstall({ home }) {
  if (!home) throw new Error("HOME is not set; pass --home <directory>");
  const updated = [];
  for (const [name, path] of Object.entries(configPaths(home))) {
    const config = await readJson(path);
    if (removeOurHooks(config)) {
      await writeJson(path, config);
      updated.push(name);
    }
  }
  return { updated };
}
