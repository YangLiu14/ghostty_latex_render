// Register / remove the Stop hook in a Claude Code settings.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export function settingsPath({ project = false } = {}) {
  return project
    ? join(process.cwd(), ".claude", "settings.json")
    : join(homedir(), ".claude", "settings.json");
}

function readSettings(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e.message}`);
  }
}

function writeSettings(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

/** True if a hook command string is one of ours (matches our cli path + "hook"). */
function isOurs(cmd, marker) {
  return typeof cmd === "string" && cmd.includes(marker) && /\bhook\b/.test(cmd);
}

/**
 * Add a Stop hook running `command`. Idempotent: removes any prior entry of
 * ours (identified by `marker`) first. Returns the settings path written.
 */
export function installHook(command, marker, opts = {}) {
  const path = settingsPath(opts);
  const data = readSettings(path);
  data.hooks ??= {};
  data.hooks.Stop ??= [];

  // Drop previous entries of ours, then re-add (handles path/version changes).
  data.hooks.Stop = data.hooks.Stop.filter(
    (group) =>
      !(group.hooks || []).some((h) => isOurs(h.command, marker)),
  );
  data.hooks.Stop.push({
    hooks: [{ type: "command", command }],
  });

  writeSettings(path, data);
  return path;
}

/** Remove our Stop hook entries. Returns {path, removed:boolean}. */
export function uninstallHook(marker, opts = {}) {
  const path = settingsPath(opts);
  if (!existsSync(path)) return { path, removed: false };
  const data = readSettings(path);
  const before = (data.hooks?.Stop || []).length;
  let after = before;
  if (data.hooks?.Stop) {
    data.hooks.Stop = data.hooks.Stop.filter(
      (group) => !(group.hooks || []).some((h) => isOurs(h.command, marker)),
    );
    after = data.hooks.Stop.length;
    if (data.hooks.Stop.length === 0) delete data.hooks.Stop;
    if (Object.keys(data.hooks).length === 0) delete data.hooks;
  }
  writeSettings(path, data);
  return { path, removed: after < before };
}

/** Whether one of our Stop hooks is currently installed. */
export function isInstalled(marker, opts = {}) {
  const path = settingsPath(opts);
  if (!existsSync(path)) return false;
  const data = readSettings(path);
  return (data.hooks?.Stop || []).some((group) =>
    (group.hooks || []).some((h) => isOurs(h.command, marker)),
  );
}
