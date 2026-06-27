// Terminal theme detection (OSC 10/11) + a derived palette, so the preview
// blends with the user's Ghostty colors instead of a fixed dark box.

const DEFAULT_BG = "#1a1a1a";
const DEFAULT_FG = "#e6e6e6";

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const pad2 = (n) => n.toString(16).padStart(2, "0");
export function rgbToHex(r, g, b) {
  return `#${pad2(r)}${pad2(g)}${pad2(b)}`;
}

/** Parse an OSC color reply like "rgb:1a1a/1a1a/1a1a" → "#1a1a1a". */
export function parseOscColor(s) {
  const m = s.match(/rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/);
  if (!m) return null;
  const hi = (h) => parseInt((h.length === 1 ? h + h : h.slice(0, 2)), 16);
  return rgbToHex(hi(m[1]), hi(m[2]), hi(m[3]));
}

/** Perceived luminance 0..1. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Mix two hex colors; t=0 → a, t=1 → b. */
export function blend(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return rgbToHex(m(ar, br), m(ag, bg), m(ab, bb));
}

/** Build a palette from a background/foreground pair. */
export function buildTheme(bgHex, fgHex) {
  const bg = bgHex || DEFAULT_BG;
  const fg = fgHex || DEFAULT_FG;
  const isDark = luminance(bg) < 0.5;
  return {
    bg,
    fg,
    dim: blend(fg, bg, 0.45),
    faint: blend(fg, bg, 0.72),
    accent: isDark ? "#7dcfff" : "#2563eb",
    isDark,
  };
}

/** Query one OSC color (10=fg, 11=bg). Resolves to a hex string or null. */
export function queryOsc(code, ms = 250) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return resolve(null);
    let buf = "";
    const onData = (d) => {
      buf += d.toString("latin1");
      const hex = parseOscColor(buf);
      if (hex) {
        cleanup();
        resolve(hex);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      process.stdin.removeListener("data", onData);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, ms);
    process.stdin.on("data", onData);
    process.stdout.write(`\x1b]${code};?\x07`);
  });
}

/** Detect the terminal palette (best-effort; falls back to a dark default). */
export async function detectTheme() {
  const bg = await queryOsc(11);
  const fg = await queryOsc(10);
  return buildTheme(bg, fg);
}
