// Open a Ghostty split running a command, via AppleScript (no keystroke hacks).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "ghostty-split.applescript");
const WRAP_DIR = join(tmpdir(), "cc-latex");

/**
 * Split the focused Ghostty terminal and run `command` in the new surface.
 * `command` should be a single executable path (no args) so it runs the same
 * way regardless of whether Ghostty shell-parses or exec's it directly.
 * @returns {{ok:boolean, error?:string}}
 */
export function openSplit(command, workdir, direction = "right") {
  try {
    execFileSync("osascript", [SCRIPT, command, workdir, direction], {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 5000,
    });
    return { ok: true };
  } catch (e) {
    const msg = (e.stderr && e.stderr.toString().trim()) || e.message;
    return { ok: false, error: msg };
  }
}

/**
 * Perform a Ghostty action string (e.g. "resize_split:right,120") on the
 * currently focused terminal surface. Best-effort.
 * @returns {{ok:boolean, error?:string}}
 */
export function performAction(action) {
  try {
    execFileSync(
      "osascript",
      [
        "-e",
        `tell application "Ghostty" to perform action "${action}" on (focused terminal of selected tab of front window)`,
      ],
      { stdio: ["ignore", "ignore", "pipe"], timeout: 4000 },
    );
    return { ok: true };
  } catch (e) {
    const msg = (e.stderr && e.stderr.toString().trim()) || e.message;
    return { ok: false, error: msg };
  }
}

const sh = (s) => `"${String(s).replace(/(["$`\\])/g, "\\$1")}"`;

/**
 * Build a tiny wrapper script that execs the preview watcher (stderr -> log),
 * then open a Ghostty split that runs it. Passing a single path as the command
 * avoids all shell-quoting ambiguity at Ghostty's execution boundary.
 */
export function openPreviewSplit({
  nodeBin,
  cliPath,
  transcript,
  sessionId,
  cwd,
  direction = "right",
  scale = 1,
}) {
  mkdirSync(WRAP_DIR, { recursive: true });
  const wrapper = join(WRAP_DIR, `${sessionId}.command`);
  const errLog = join(WRAP_DIR, `${sessionId}.err`);
  const body =
    "#!/bin/sh\n" +
    `exec ${sh(nodeBin)} ${sh(cliPath)} preview --session ${sh(transcript)} ` +
    `--scale ${Number(scale) || 1} --fit 2>${sh(errLog)}\n`;
  writeFileSync(wrapper, body);
  chmodSync(wrapper, 0o755);
  const res = openSplit(wrapper, cwd, direction);
  return { ...res, wrapper, errLog };
}
