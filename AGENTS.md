# Project Behavior Extensions

## Think Before Coding
- Preserve the `PermissionRequest` allow JSON and fail closed to manual approval when blacklist policy evaluation errors; verify with `npm test` and representative Codex/Claude inputs.

## Simplicity First
- Keep the Node >=18 ESM implementation build free and production dependency free; verify with the existing `npm test` command.

## Surgical Changes
- Preserve merged user configuration, backup creation, and installer idempotency when changing installation behavior; verify with `npm test` and repeated runs against a temporary HOME.

## Goal-Driven Execution
- Keep Codex and Claude on the shared blacklist and approval log paths, including source attribution; verify both platform input paths with a temporary HOME.
