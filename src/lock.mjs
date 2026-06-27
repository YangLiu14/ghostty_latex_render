// Per-session lock so only one preview pane runs per Claude session.
// The lock file holds the preview process pid; liveness is checked with kill(pid,0).
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = join(tmpdir(), "cc-latex");

export function lockPath(sessionId) {
  mkdirSync(DIR, { recursive: true });
  return join(DIR, `${sessionId}.lock`);
}

/** @returns {number|null} pid of a live preview for this session, else null. */
export function livePid(sessionId) {
  let pid;
  try {
    pid = parseInt(readFileSync(lockPath(sessionId), "utf8").trim(), 10);
  } catch {
    return null;
  }
  if (!pid) return null;
  try {
    process.kill(pid, 0); // signal 0: existence/permission check only
    return pid;
  } catch (e) {
    return e.code === "EPERM" ? pid : null; // EPERM => exists (other user)
  }
}

export function writeLock(sessionId, pid = process.pid) {
  writeFileSync(lockPath(sessionId), String(pid));
}

export function removeLock(sessionId) {
  try {
    rmSync(lockPath(sessionId));
  } catch {
    /* already gone */
  }
}
