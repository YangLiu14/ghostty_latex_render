// LaTeX -> SVG (MathJax) -> PNG (sharp). Pure npm, no system TeX needed.
//
// renderToPng / renderStack return the natural size in `ex` units so the
// display layer can size the image by the formula itself (not the pane width).
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import sharp from "sharp";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const texInput = new TeX({ packages: AllPackages });
const svgOutput = new SVG({ fontCache: "none" });
const mjDoc = mathjax.document("", { InputJax: texInput, OutputJax: svgOutput });

// Pixel resolution of the rasterized PNG. Only affects crispness — the on-screen
// size is decided by the display layer via Kitty's cell count.
const PX_PER_EX = 16;
const DENSITY = 192;

/** Convert a TeX string to a standalone <svg> string. Throws on parse error. */
export function tex2svg(tex, { display = true, color = "#e6e6e6" } = {}) {
  const node = mjDoc.convert(tex, { display });
  let svg = adaptor.innerHTML(node);
  if (/data-mjx-error|merror/i.test(svg)) {
    throw new Error("MathJax could not parse: " + tex);
  }
  svg = svg.replace(/<svg /, `<svg color="${color}" `);
  return svg;
}

/** Read the natural width/height (in ex) from a MathJax <svg>. */
function exDims(svg) {
  const w = svg.match(/width="([\d.]+)ex"/);
  const h = svg.match(/height="([\d.]+)ex"/);
  return { exW: w ? parseFloat(w[1]) : 1, exH: h ? parseFloat(h[1]) : 1 };
}

function exToPx(svg) {
  return svg.replace(/(width|height)="([\d.]+)ex"/g, (_, attr, val) => {
    return `${attr}="${(parseFloat(val) * PX_PER_EX).toFixed(2)}px"`;
  });
}

/**
 * Render TeX to a PNG.
 * @returns {Promise<{png:Buffer, exW:number, exH:number}>}
 */
export async function renderToPng(
  tex,
  { display = true, color = "#e6e6e6", background = "#1a1a1a", padding = 16 } = {},
) {
  const svg = tex2svg(tex, { display, color });
  const { exW, exH } = exDims(svg);
  const png = await sharp(Buffer.from(exToPx(svg), "utf8"), { density: DENSITY })
    .flatten({ background })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background })
    .png()
    .toBuffer();
  return { png, exW, exH };
}

/**
 * Render several formulas stacked vertically into one PNG.
 * Unparseable formulas are skipped. Returns the composite plus its natural
 * width in ex (the widest formula) for sizing.
 * @returns {Promise<{png:Buffer, exW:number}|null>}
 */
export async function renderStack(items, opts = {}) {
  const { background = "#1a1a1a", gap = 24 } = opts;
  if (!items || items.length === 0) return null;

  const tiles = [];
  for (const it of items) {
    try {
      const { png, exW } = await renderToPng(it.tex, {
        display: it.type === "block",
        background,
        ...opts,
      });
      const meta = await sharp(png).metadata();
      tiles.push({ png, exW, width: meta.width, height: meta.height });
    } catch {
      continue;
    }
  }
  if (tiles.length === 0) return null;

  const exW = Math.max(...tiles.map((t) => t.exW));
  if (tiles.length === 1) return { png: tiles[0].png, exW };

  const width = Math.max(...tiles.map((t) => t.width));
  const height =
    tiles.reduce((s, t) => s + t.height, 0) + gap * (tiles.length - 1);
  let top = 0;
  const composites = tiles.map((t) => {
    const c = { input: t.png, top, left: 0 };
    top += t.height + gap;
    return c;
  });
  const png = await sharp({ create: { width, height, channels: 4, background } })
    .composite(composites)
    .png()
    .toBuffer();
  return { png, exW };
}
