import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url);

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
        }]
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
  run("install.mjs", home);

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
});
