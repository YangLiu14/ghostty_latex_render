#!/usr/bin/env node
// cc-latex — auto-render LaTeX from Claude Code answers in a Ghostty split pane.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  installHook,
  uninstallHook,
  isInstalled,
  settingsPath,
} from "./settings.mjs";
import { watchSession, showLatestOnce, demo } from "./preview.mjs";
import { runHook } from "./hook.mjs";
import { findSessionFile } from "./transcript.mjs";
import { livePid } from "./lock.mjs";

const CLI_PATH = fileURLToPath(import.meta.url);
const NODE = process.execPath;
const MARKER = CLI_PATH; // our hook is identified by this path in its command

function parseFlags(argv) {
  const f = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--project") f.project = true;
    else if (t === "--once") f.once = true;
    else if (t === "--all") f.all = true;
    else if (t === "--native") f.native = true;
    else if (t === "--direction") f.direction = argv[++i];
    else if (t === "--session") f.session = argv[++i];
    else if (t === "--scale") f.scale = parseFloat(argv[++i]);
    else if (t === "--cols") f.cols = parseInt(argv[++i], 10);
    else f._.push(t);
  }
  return f;
}

const USAGE = `cc-latex — render Claude Code LaTeX in a Ghostty split pane

Usage:
  cc-latex setup [--project] [--direction right|left|up|down]
        Register the Claude Code Stop hook so panes open automatically.
  cc-latex uninstall [--project]
        Remove the hook.
  cc-latex status
        Show whether the hook is installed and which previews are live.
  cc-latex preview [--session PATH] [--once] [--all] [--scale N] [--native]
        Run the preview watcher (normally launched automatically).
        --all shows every formula (default: only complex ones).
  cc-latex demo '<tex>'
        Render one formula to verify Ghostty image support.
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const f = parseFlags(rest);
  const direction = f.direction || "right";
  const scale = f.scale > 0 ? f.scale : 1;

  switch (cmd) {
    case "setup": {
      const command = `${q(NODE)} ${q(CLI_PATH)} hook --direction ${direction} --scale ${scale}`;
      const path = installHook(command, MARKER, { project: f.project });
      console.log(`✓ Stop hook installed in ${path}`);
      console.log(`  Split direction: ${direction} · scale: ${scale}`);
      console.log(
        "  New Claude Code sessions in Ghostty will auto-open a math pane\n" +
          "  the first time an answer contains LaTeX. (Restart any running session.)",
      );
      break;
    }
    case "uninstall": {
      const { path, removed } = uninstallHook(MARKER, { project: f.project });
      console.log(
        removed ? `✓ Hook removed from ${path}` : `No cc-latex hook found in ${path}`,
      );
      break;
    }
    case "status": {
      for (const scope of [{}, { project: true }]) {
        const label = scope.project ? "project" : "global";
        console.log(
          `${isInstalled(MARKER, scope) ? "✓" : "✗"} hook (${label}): ${settingsPath(scope)}`,
        );
      }
      console.log("Live previews:");
      const live = listLivePreviews();
      if (live.length === 0) console.log("  (none)");
      else live.forEach((p) => console.log(`  pid ${p.pid}  ${p.session}`));
      console.log(`Logs: ${join(tmpdir(), "cc-latex")}/  (hook.log, <session>.err)`);
      break;
    }
    case "hook": {
      const code = await runHook({
        nodeBin: NODE,
        cliPath: CLI_PATH,
        direction,
        scale,
      });
      process.exit(code);
      break;
    }
    case "preview": {
      const sessionFile = f.session || findSessionFile(process.cwd());
      if (!sessionFile) {
        console.error(
          "No session transcript found. Run from the project dir or pass --session.",
        );
        process.exit(1);
      }
      if (f.once) await showLatestOnce(sessionFile, f);
      else await watchSession(sessionFile, f);
      break;
    }
    case "demo": {
      if (!f._[0]) {
        console.error("Usage: cc-latex demo '<tex>'");
        process.exit(1);
      }
      await demo(f._[0], f);
      break;
    }
    default:
      console.log(USAGE);
  }
}

function listLivePreviews() {
  const dir = join(tmpdir(), "cc-latex");
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const file of files) {
    if (!file.endsWith(".lock")) continue;
    const session = file.replace(/\.lock$/, "");
    const pid = livePid(session);
    if (pid) out.push({ pid, session });
  }
  return out;
}

function q(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

main().catch((e) => {
  console.error(`fatal: ${e.stack || e}`);
  process.exit(1);
});
