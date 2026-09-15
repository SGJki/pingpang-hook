import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url);
const cli = new URL("../bin/pingpang-hook.mjs", import.meta.url).pathname;

function run(script, home) {
  execFileSync(process.execPath, [new URL(`../scripts/${script}`, import.meta.url).pathname, "--home", home], { stdio: "pipe" });
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("installer preserves settings, remains idempotent, and uninstalls only its hooks", async () => {
  const home = await mkdtemp(join(tmpdir(), "pingpang-hook-"));
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(join(home, ".codex", "hooks.json"), JSON.stringify({
    hooks: {
      PermissionRequest: [{
        hooks: [{
          type: "command",
          command: "'/old/.pingpang-hook/bin/pingpang-sound' approval",
          timeout: 3
        }],
        matcher: "*"
      }]
    }
  }));
  await mkdir(join(home, ".claude"), { recursive: true });
  await writeFile(join(home, ".claude", "settings.json"), JSON.stringify({
    model: "sonnet",
    hooks: {
      PermissionRequest: [{
        hooks: [{
          type: "command",
          command: "'/old/.pingpang-hook/bin/pingpang-sound' approval",
          timeout: 3
        }]
      }],
      Stop: [{ hooks: [{ type: "command", command: "/usr/local/bin/other-stop" }] }]
    }
  }));

  run("install.mjs", home);
  const blacklistPath = join(home, ".pingpang-hook", "blacklist");
  assert.match(await readFile(blacklistPath, "utf8"), /^# PingPang Hook/);

  // A user-edited blacklist must survive reinstalls untouched.
  await writeFile(blacklistPath, "^sentinel\\s+pattern$\n");
  run("install.mjs", home);
  assert.equal(await readFile(blacklistPath, "utf8"), "^sentinel\\s+pattern$\n");

  for (const relativePath of [".codex/hooks.json", ".claude/settings.json"]) {
    const config = await json(join(home, relativePath));
    assert.equal(config.hooks.PermissionRequest.length, 1);
    assert.equal(config.hooks.Stop.filter((group) => group.hooks.some((hook) => hook.command.includes(".pingpang-hook/bin/pingpang-sound"))).length, 1);
  }
  const codex = await json(join(home, ".codex/hooks.json"));
  assert.equal(codex.hooks.PermissionRequest[0].matcher, undefined);
  assert.match(codex.hooks.PermissionRequest[0].hooks[0].command, /codex-approval$/);
  const claude = await json(join(home, ".claude/settings.json"));
  assert.equal(claude.hooks.PermissionRequest[0].matcher, undefined);
  assert.match(claude.hooks.PermissionRequest[0].hooks[0].command, /claude-approval$/);
  assert.equal(claude.model, "sonnet");
  assert.equal(claude.hooks.Stop.length, 2);

  run("uninstall.mjs", home);
  const cleanedClaude = await json(join(home, ".claude/settings.json"));
  assert.equal(cleanedClaude.model, "sonnet");
  assert.equal(cleanedClaude.hooks.Stop.length, 1);
  assert.equal(cleanedClaude.hooks.PermissionRequest, undefined);
  // Uninstall only removes hooks; the shared blacklist file stays in place.
  assert.equal(await readFile(blacklistPath, "utf8"), "^sentinel\\s+pattern$\n");
});

test("uninstaller is a no-op when no configs or PingPang hooks exist", async () => {
  const home = await mkdtemp(join(tmpdir(), "pingpang-hook-empty-"));
  const result = spawnSync(process.execPath, [new URL("../scripts/uninstall.mjs", import.meta.url).pathname, "--home", home], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No PingPang Hook entries found/);
});

test("installer handles missing configs, preserves third-party and malformed hook groups", async () => {
  const home = await mkdtemp(join(tmpdir(), "pingpang-hook-edge-"));
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(join(home, ".codex", "hooks.json"), JSON.stringify({ hooks: {
    PermissionRequest: [null, { hooks: [{ type: "command", command: "/usr/bin/custom" }] }, { bad: true }]
  }}));
  run("install.mjs", home);
  const configPath = join(home, ".codex", "hooks.json");
  const config = await json(configPath);
  assert.equal(config.hooks.PermissionRequest.length, 4);
  assert.equal(config.hooks.PermissionRequest[1].hooks[0].command, "/usr/bin/custom");
  assert.ok(config.hooks.Stop);
  assert.ok(await json(join(home, ".claude", "settings.json")));
  assert.ok(await readFile(`${configPath}.pingpang-hook.bak`, "utf8"));
  const backup = await readFile(`${configPath}.pingpang-hook.bak`, "utf8");
  run("install.mjs", home);
  assert.equal(await readFile(`${configPath}.pingpang-hook.bak`, "utf8"), backup);
});

test("installer rejects missing home argument and malformed JSON", async () => {
  const script = new URL("../scripts/install.mjs", import.meta.url).pathname;
  const missing = spawnSync(process.execPath, [script, "--home"], { encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  const home = await mkdtemp(join(tmpdir(), "pingpang-hook-bad-"));
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(join(home, ".codex", "hooks.json"), "[]");
  const bad = spawnSync(process.execPath, [script, "--home", home], { encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /root must be an object/);
});

test("published CLI defaults to install and supports uninstall", async () => {
  const home = await mkdtemp(join(tmpdir(), "pingpang-hook-cli-"));
  const installResult = spawnSync(process.execPath, [cli, "--home", home], { encoding: "utf8" });
  assert.equal(installResult.status, 0, installResult.stderr);
  assert.match(installResult.stdout, /Installed notifier/);

  const helpResult = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(helpResult.status, 0);
  assert.match(helpResult.stdout, /Usage: pingpang-hook/);

  const uninstallResult = spawnSync(process.execPath, [cli, "uninstall", "--home", home], { encoding: "utf8" });
  assert.equal(uninstallResult.status, 0, uninstallResult.stderr);
  assert.match(uninstallResult.stdout, /Updated:/);
});
