// Right-pane LaTeX preview watcher. Reusable functions; CLI wiring lives in cli.mjs.
//
// In a TTY (the auto-opened split) the watcher is interactive: a numbered menu
// of the latest answer's formulas, navigable by click / j-k / arrows / digits,
// with the selected formula enlarged below. Non-TTY modes render a static stack.
import { watch } from "node:fs";
import { basename } from "node:path";
import { extractMath } from "./extract.mjs";
import { filterComplex, showAll } from "./complexity.mjs";
import { renderStack, renderToPng } from "./render.mjs";
import { displayPng, deleteAllImages, clearScreen } from "./kitty.mjs";
import { readLatestAssistantText } from "./transcript.mjs";
import { writeLock, removeLock, livePid } from "./lock.mjs";
import { performAction } from "./launcher.mjs";

export function sessionIdFromPath(p) {
  return basename(p).replace(/\.jsonl$/, "");
}

// Columns ≈ exWidth * BASE * scale (BASE folds in math-to-font ratio + cell aspect).
const BASE = 1.5;
const MENU_TOP = 3; // screen row (1-based) where the formula menu begins

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const inv = (s) => `\x1b[7m${s}\x1b[0m`;
const w = (s) => process.stdout.write(s);

function scaleOf(opts) {
  if (opts.scale > 0) return opts.scale;
  const env = parseFloat(process.env.CC_LATEX_SCALE);
  return env > 0 ? env : 1;
}

function paneCols(opts) {
  if (opts.native) return Infinity;
  return process.stdout.columns || 80;
}

function colsFor(exW, opts) {
  const want = Math.round(exW * BASE * scaleOf(opts));
  return Math.max(1, Math.min(want, paneCols(opts)));
}

const now = () => new Date().toLocaleTimeString();

// ---- non-interactive (static) rendering --------------------------------------

async function drawStacked(items, label, opts) {
  clearScreen();
  deleteAllImages();
  w(bold("  Claude Code · LaTeX preview\n"));
  w(dim(`  ${label}\n\n`));
  if (!items.length) return w(dim("  (no LaTeX in the latest answer)\n"));
  try {
    const r = await renderStack(items);
    if (r) displayPng(r.png, { cols: colsFor(r.exW, opts) });
    else w(dim("  (formulas could not be rendered)\n"));
  } catch (e) {
    w(`  render error: ${e.message}\n`);
  }
  w("\n");
}

export async function showLatestOnce(sessionFile, opts = {}) {
  const msg = readLatestAssistantText(sessionFile);
  const items = msg ? filterComplex(extractMath(msg.text), showAll(opts)) : [];
  await drawStacked(items, `${items.length} formula(s) · ${now()}`, opts);
}

export async function demo(tex, opts = {}) {
  const r = await renderToPng(tex, { display: true });
  clearScreen();
  deleteAllImages();
  w(bold("  Claude Code · LaTeX preview\n"));
  w(dim(`  demo: ${tex}\n\n`));
  displayPng(r.png, { cols: colsFor(r.exW, opts) });
  w("\n");
}

// ---- interactive pager -------------------------------------------------------

export function snippet(tex, max) {
  const one = tex.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

/** Wrap an index by `delta` within `n` items. */
export function nextIndex(index, delta, n) {
  if (n < 1) return 0;
  return (index + delta + n) % n;
}

/** Map a 1-based screen row to a menu item index, or -1 if outside the menu. */
export function rowToIndex(screenY, n) {
  const i = screenY - MENU_TOP; // title(row1)+blank(row2); menu rows start at MENU_TOP
  return i >= 0 && i < n ? i : -1;
}

/** Decode a raw input chunk into an intent, or null. */
export function decodeInput(str) {
  const mouse = str.match(/\x1b\[<(\d+);(\d+);(\d+)M/);
  if (mouse) {
    return parseInt(mouse[1], 10) === 0
      ? { kind: "clickRow", y: parseInt(mouse[3], 10) }
      : null; // ignore non-left-button events
  }
  if (str === "\x1b[A" || str === "\x1b[D") return { kind: "move", delta: -1 };
  if (str === "\x1b[B" || str === "\x1b[C") return { kind: "move", delta: 1 };
  if (str === "q" || str === "\x03") return { kind: "quit" };
  if (str === "j" || str === "n") return { kind: "move", delta: 1 };
  if (str === "k" || str === "p") return { kind: "move", delta: -1 };
  if (str >= "1" && str <= "9") return { kind: "jump", index: str.charCodeAt(0) - 49 };
  return null;
}

function makePager(opts) {
  const state = { items: [], index: 0, label: "", cache: new Map() };

  async function renderSel() {
    const it = state.items[state.index];
    if (!it) return null;
    if (state.cache.has(state.index)) return state.cache.get(state.index);
    let r = null;
    try {
      r = await renderToPng(it.tex, { display: it.type === "block" });
    } catch (e) {
      r = { error: e.message };
    }
    state.cache.set(state.index, r);
    return r;
  }

  async function draw() {
    clearScreen();
    deleteAllImages();
    const n = state.items.length;
    const pos = n ? `[${state.index + 1}/${n}]` : "";
    w(bold("  Claude Code · LaTeX preview ") + dim(pos) + dim(`  ${state.label}\n`));
    if (n === 0) {
      w("\n" + dim("  (no LaTeX in the latest answer)\n"));
      return;
    }
    w("\n");
    if (n > 1) {
      const max = Math.max(10, (process.stdout.columns || 80) - 10);
      state.items.forEach((it, i) => {
        const tag = it.type === "block" ? "▦" : "·";
        const line = ` ${String(i + 1).padStart(2)} ${tag} ${snippet(it.tex, max)} `;
        w("  " + (i === state.index ? inv(line) : dim(line)) + "\n");
      });
      w("\n");
    }
    const r = await renderSel();
    if (r && r.png) displayPng(r.png, { cols: colsFor(r.exW, opts) });
    else if (r && r.error) w(`  render error: ${r.error}\n`);
    w("\n");
    if (n > 1) w(dim("  click / j k / ← → / 1-9 to select · q to close\n"));
  }

  function setItems(items, label) {
    state.items = items;
    state.index = 0;
    state.label = label;
    state.cache.clear();
    return draw();
  }

  function select(i) {
    if (i < 0 || i >= state.items.length || i === state.index) return;
    state.index = i;
    return draw();
  }

  function move(delta) {
    if (state.items.length < 2) return;
    return select(nextIndex(state.index, delta, state.items.length));
  }

  return { state, draw, setItems, move, select };
}

function handleInput(buf, pager) {
  const intent = decodeInput(buf.toString());
  if (!intent) return;
  switch (intent.kind) {
    case "quit":
      return quit();
    case "move":
      return pager.move(intent.delta);
    case "jump":
      return pager.select(intent.index);
    case "clickRow":
      return pager.select(rowToIndex(intent.y, pager.state.items.length));
  }
}

let quit = () => process.exit(0);

// ---- fit the split to ~1/3 of the window ------------------------------------

// A fresh right-split starts at ~50% width, so 1/3 of the window is 2/3 of this
// pane. Target columns are computed from that ratio.
export function fitTargetCols(startCols, fraction = 1 / 3, paneFraction = 0.5) {
  return Math.round(startCols * (fraction / paneFraction));
}

function onceResize(ms) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      process.stdout.removeListener("resize", fin);
      resolve();
    };
    const t = setTimeout(fin, ms);
    process.stdout.on("resize", fin);
  });
}

// Shrink the split until our column count reaches the target. Self-calibrating:
// one probe move learns pixels-per-column and the shrink direction (Ghostty's
// resize_split amount is in pixels), a second move covers the rest. Best-effort:
// if it can't resize (single pane, not focused) it leaves the pane as-is.
async function fitToThird() {
  const start = process.stdout.columns || 0;
  const target = fitTargetCols(start);
  if (!start || target < 4 || target >= start) return;

  const PROBE = 60;
  let dir = "right";
  performAction(`resize_split:${dir},${PROBE}`);
  await onceResize(400);
  const now = process.stdout.columns || start;
  if (now > start) dir = "left"; // "right" grew the pane → shrink with "left"
  const moved = Math.abs(now - start);
  if (moved === 0) return; // resize had no effect

  const pxPerCol = PROBE / moved;
  const remaining = (process.stdout.columns || start) - target;
  if (remaining > 0) {
    performAction(`resize_split:${dir},${Math.max(1, Math.round(remaining * pxPerCol))}`);
    await onceResize(400);
  }
}

// ---- watcher -----------------------------------------------------------------

export async function watchSession(sessionFile, opts = {}) {
  const sessionId = sessionIdFromPath(sessionFile);

  const other = livePid(sessionId);
  if (other && other !== process.pid) {
    w(dim(`A preview is already running for this session (pid ${other}).\n`));
    return;
  }
  writeLock(sessionId);

  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  if (interactive) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    w("\x1b[?1000h\x1b[?1006h"); // enable mouse reporting (SGR)
  }

  if (interactive && opts.fit) await fitToThird();
  const cleanup = () => {
    if (interactive) {
      w("\x1b[?1000l\x1b[?1006l");
      try {
        process.stdin.setRawMode(false);
      } catch {}
    }
    removeLock(sessionId);
  };
  quit = () => {
    cleanup();
    process.exit(0);
  };
  process.on("exit", cleanup);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, quit);

  const pager = interactive ? makePager(opts) : null;
  let lastId = null;

  async function refresh() {
    const msg = readLatestAssistantText(sessionFile);
    if (!msg || msg.id === lastId) return;
    lastId = msg.id;
    const items = filterComplex(extractMath(msg.text), showAll(opts));
    const label = `${items.length} formula(s) · ${now()}`;
    if (pager) await pager.setItems(items, label);
    else await drawStacked(items, label, opts);
  }

  await refresh();
  if (!lastId) {
    clearScreen();
    deleteAllImages();
    w(bold("  Claude Code · LaTeX preview\n"));
    w(dim("  waiting for the next answer…\n"));
  }

  if (pager) process.stdin.on("data", (b) => handleInput(b, pager));
  process.stdout.on("resize", () => (pager ? pager.draw() : null));

  let timer = null;
  watch(sessionFile, () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 200);
  });
}
