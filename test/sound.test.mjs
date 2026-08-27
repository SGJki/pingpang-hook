import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

const script = new URL("../bin/pingpang-sound", import.meta.url).pathname;
const nodePath = process.env.PATH;

function runHook(input, env = {}, mode = "codex-approval") {
  const result = spawnSync(script, [mode], {
    env: { ...process.env, ...env, PATH: nodePath },
    input: JSON.stringify(input),
    encoding: "utf8"
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  return { stdout: result.stdout, stderr: result.stderr };
}

const codexCommand = (command, toolName = "Bash") => ({
  hook_event_name: "PermissionRequest",
  model: "gpt-5-codex",
  turn_id: "turn-1",
  tool_name: toolName,
  tool_input: { command }
});

const claudeCommand = (command, extra = {}) => ({
  session_id: "session-1",
  transcript_path: "/tmp/transcript.jsonl",
  cwd: "/tmp/project",
  permission_mode: "default",
  hook_event_name: "PermissionRequest",
  tool_name: "Bash",
  tool_input: { command },
  ...extra
});

test("automatically approves any non-blacklisted Codex command request", () => {
  const result = runHook(codexCommand("npm test", "Shell"), { PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff") });
  assert.deepEqual(JSON.parse(result.stdout), {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "allow" }
    }
  });
  assert.equal(result.stderr, "");
});

test("plays the approval signal and falls through for blacklisted commands", () => {
  const result = runHook(codexCommand("git push origin main", "Shell"), {
    PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff")
  });
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "\u0007");
});

test("keeps non-Codex PermissionRequest behavior as an approval signal", () => {
  const result = runHook({
    hook_event_name: "PermissionRequest",
    tool_name: "Bash",
    tool_input: { command: "npm test" }
  }, { PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff") }, "approval");
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "\u0007");
});

test("supports additional newline-delimited blacklist patterns", () => {
  const result = runHook(codexCommand("deploy production", "Exec"), {
    PINGPANG_APPROVAL_BLACKLIST: "^deploy\\s+production$",
    PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff")
  });
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "\u0007");
});

test("automatically approves non-blacklisted Claude Code command requests", () => {
  const result = runHook(claudeCommand("npm test"), { PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff") }, "claude-approval");
  assert.deepEqual(JSON.parse(result.stdout), {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "allow" }
    }
  });
  assert.equal(result.stderr, "");
});

test("plays the approval signal for blacklisted Claude Code commands", () => {
  const result = runHook(claudeCommand("sudo apt install example"), {
    PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff")
  }, "claude-approval");
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "\u0007");
});

test("treats Claude Code non-command permission requests as approval signals", () => {
  const result = runHook({
    session_id: "session-1",
    permission_mode: "default",
    hook_event_name: "PermissionRequest",
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/example.txt", old_string: "a", new_string: "b" }
  }, { PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff") }, "claude-approval");
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "\u0007");
});

test("never auto-approves Claude Code requests made in plan mode", () => {
  const result = runHook(claudeCommand("npm test", { permission_mode: "plan" }), {
    PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff")
  }, "claude-approval");
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "\u0007");
});

test("rejects unknown event modes with the original usage exit code", () => {
  const result = spawnSync(script, ["unknown"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /Usage: pingpang-sound/);
});
