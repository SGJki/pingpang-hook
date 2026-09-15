import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("../bin/pingpang-sound", import.meta.url).pathname;
const nodePath = process.env.PATH;
const testHome = mkdtempSync(join(tmpdir(), "pingpang-sound-"));

function runHook(input, env = {}, mode = "codex-approval") {
  const result = spawnSync(script, [mode], {
    env: { ...process.env, HOME: testHome, ...env, PATH: nodePath },
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

function writeBlacklist(content) {
  mkdirSync(join(testHome, ".pingpang-hook"), { recursive: true });
  writeFileSync(join(testHome, ".pingpang-hook", "blacklist"), content);
}

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

test("applies the shared blacklist file to Claude Code", () => {
  writeBlacklist("# shared rule\n\n^deploy\\s+production$\n");
  const result = runHook(claudeCommand("deploy production"), {
    PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff")
  }, "claude-approval");
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "\u0007");
});

test("applies the shared blacklist file to Codex", () => {
  writeBlacklist("^deploy\\s+production$\n");
  const result = runHook(codexCommand("deploy production", "Shell"), {
    PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff")
  });
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "\u0007");
});

test("ignores comments and blank lines in the shared blacklist file", () => {
  writeBlacklist("# deploy\\s+production\n\n   \n");
  const result = runHook(claudeCommand("deploy production"), {
    PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff")
  }, "claude-approval");
  assert.deepEqual(JSON.parse(result.stdout), {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "allow" }
    }
  });
});

test("rejects unknown event modes with the original usage exit code", () => {
  const result = spawnSync(script, ["unknown"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /Usage: pingpang-sound/);
});

function hookLogEntries() {
  try {
    return readFileSync(join(testHome, ".pingpang-hook", "hook.log"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

test("logs every approval request with its platform source", () => {
  runHook(claudeCommand("npm run lint"), { PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff") }, "claude-approval");
  runHook(codexCommand("npm run build", "Shell"), { PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff") });
  const claudeEntry = hookLogEntries().at(-2);
  const codexEntry = hookLogEntries().at(-1);
  assert.equal(claudeEntry.source, "claude");
  assert.equal(claudeEntry.command, "npm run lint");
  assert.equal(claudeEntry.decision, "allow");
  assert.equal(codexEntry.source, "codex");
  assert.equal(codexEntry.command, "npm run build");
  assert.equal(codexEntry.decision, "allow");
  for (const entry of [claudeEntry, codexEntry]) {
    assert.match(entry.time, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(entry.pattern, null);
  }
});

test("records the blacklist pattern that forced manual review", () => {
  runHook(claudeCommand("git push origin main"), {
    PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff")
  }, "claude-approval");
  const entry = hookLogEntries().at(-1);
  assert.equal(entry.source, "claude");
  assert.equal(entry.decision, "manual");
  assert.equal(entry.reason, "blacklisted");
  assert.match(entry.pattern, /git/);
});

test("labels plan-mode and non-command requests as manual review", () => {
  runHook(claudeCommand("npm test", { permission_mode: "plan" }), {
    PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff")
  }, "claude-approval");
  const planEntry = hookLogEntries().at(-1);
  assert.equal(planEntry.decision, "manual");
  assert.equal(planEntry.reason, "plan-mode");
  runHook({
    session_id: "session-1",
    permission_mode: "default",
    hook_event_name: "PermissionRequest",
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/example.txt", old_string: "a", new_string: "b" }
  }, { PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff") }, "claude-approval");
  const editEntry = hookLogEntries().at(-1);
  assert.equal(editEntry.decision, "manual");
  assert.equal(editEntry.reason, "non-command");
  assert.equal(editEntry.tool, "Edit");
  assert.equal(editEntry.command, null);
});

test("keeps approving when the log cannot be written", () => {
  const blockedLogPath = join(testHome, ".pingpang-hook", "hook.log");
  rmSync(blockedLogPath, { force: true });
  mkdirSync(blockedLogPath);
  try {
    const result = runHook(claudeCommand("npm test"), { PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff") }, "claude-approval");
    assert.deepEqual(JSON.parse(result.stdout), {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" }
      }
    });
    assert.equal(result.stderr, "");
  } finally {
    rmSync(blockedLogPath, { recursive: true, force: true });
  }
});

test("flags broken blacklist policies as manual review in the log", () => {
  writeBlacklist("(unclosed\n");
  try {
    const result = runHook(claudeCommand("npm test"), {
      PINGPANG_APPROVAL_SOUND: join("/tmp", "missing.aiff")
    }, "claude-approval");
    assert.equal(result.stdout, "");
    const entry = hookLogEntries().at(-1);
    assert.equal(entry.decision, "manual");
    assert.equal(entry.reason, "blacklist-policy-error");
    assert.equal(entry.pattern, null);
  } finally {
    rmSync(join(testHome, ".pingpang-hook", "blacklist"), { force: true });
  }
});
