// Claude Code Stop-hook handler.
// Reads the hook JSON on stdin; if the just-finished answer contains LaTeX and
// no preview pane is live for this session, opens a Ghostty split running the
// preview watcher. Always exits 0 so it never disrupts Claude Code.
import { appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLatestAssistantText } from "./transcript.mjs";
import { extractMath } from "./extract.mjs";
import { filterComplex, showAll } from "./complexity.mjs";
import { livePid } from "./lock.mjs";
import { openPreviewSplit } from "./launcher.mjs";
import { sessionIdFromPath } from "./preview.mjs";

const LOG = join(tmpdir(), "cc-latex", "hook.log");

function log(obj) {
  try {
    mkdirSync(join(tmpdir(), "cc-latex"), { recursive: true });
    appendFileSync(LOG, `${new Date().toISOString()} ${JSON.stringify(obj)}\n`);
  } catch {
    /* logging is best-effort */
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", () => resolve(buf));
    setTimeout(() => resolve(buf), 1000).unref?.();
  });
}

/**
 * @param {object} env
 * @param {string} env.nodeBin absolute node binary
 * @param {string} env.cliPath absolute path to cli.mjs
 * @param {string} env.direction split direction
 * @param {number} env.scale formula size scale
 */
export async function runHook({ nodeBin, cliPath, direction, scale }) {
  let payload;
  try {
    payload = JSON.parse((await readStdin()) || "{}");
  } catch (e) {
    log({ step: "parse-stdin-failed", error: String(e) });
    return 0;
  }

  const transcript = payload.transcript_path;
  if (!transcript) {
    log({ step: "no-transcript", payloadKeys: Object.keys(payload) });
    return 0;
  }
  const sessionId = payload.session_id || sessionIdFromPath(transcript);
  const cwd = payload.cwd || process.cwd();

  const msg = readLatestAssistantText(transcript);
  const all = showAll();
  const count = msg ? filterComplex(extractMath(msg.text), all).length : 0;
  if (count === 0) {
    log({ step: "no-complex-math", sessionId, hasMsg: !!msg });
    return 0;
  }

  const existing = livePid(sessionId);
  if (existing) {
    log({ step: "already-live", sessionId, pid: existing, count });
    return 0;
  }

  const res = openPreviewSplit({
    nodeBin,
    cliPath,
    transcript,
    sessionId,
    cwd,
    direction,
    scale,
  });
  log({ step: "open-split", sessionId, count, ...res });
  return 0;
}
