// Decide whether a formula is worth rendering as an image.
//
// Principle: show math with 2-D / typographic structure that plain text can't
// convey (fractions, big operators, matrices, braced scripts, real equations);
// skip linear, text-readable trivia (a lone symbol, a simple sub/superscript,
// a simple product like `ab` or `a\cdot b`).

// Commands that imply 2-D structure -> always worth rendering.
const STRUCTURAL =
  /\\(d?frac|tfrac|cfrac|sqrt|sum|prod|coprod|int|iint|iiint|oint|lim|limsup|liminf|binom|choose|begin|[pbvV]?matrix|cases|array|aligned|underbrace|overbrace|overline|underline|widehat|widetilde|overrightarrow|substack|stackrel|atop|over|bigcup|bigcap|bigoplus|bigotimes|bigsqcup|biguplus|bigvee|bigwedge|partial|nabla|oint)\b/;

// A subscript/superscript whose operand is a braced multi-char group or nests
// another script -> visually complex (e.g. ^{n+1}, _{i,j}, ^{a^b}).
const COMPLEX_SCRIPT = /[_^]\{[^{}]{2,}\}|[_^]\{[^}]*[_^][^}]*\}/;

const RELATION =
  /(=|\\leq|\\geq|\\neq|\\approx|\\equiv|\\simeq|\\cong|\\propto|\\sim|\\to|\\rightarrow|\\mapsto|\\Rightarrow|\\iff|\\leftrightarrow|\\ll|\\gg|\\subseteq|\\subsetneq|\\subset|\\supseteq|\\supset|\\in|\\ni|\\models|\\vdash|<|>)/g;

const OPERATOR =
  /(\\pm|\\mp|\\cdot|\\times|\\div|\\ast|\\star|\\oplus|\\otimes|\\cup|\\cap|\\setminus|\\wedge|\\vee|\+|-|\/)/g;

function count(str, re) {
  const m = str.match(re);
  return m ? m.length : 0;
}

/** @param {string} tex @returns {boolean} */
export function isComplex(tex) {
  const t = (tex || "").replace(/\s+/g, "");
  if (!t) return false;
  if (STRUCTURAL.test(t)) return true;
  if (COMPLEX_SCRIPT.test(t)) return true;

  const rel = count(t, RELATION);
  const op = count(t, OPERATOR);
  const hasScript = /[_^]/.test(t);

  if (rel >= 2) return true; // chained relations (a < b < c)
  if (rel >= 1 && (op >= 1 || hasScript)) return true; // a real equation
  if (op >= 2) return true; // multi-term expression (a + b + c)
  if (t.length > 40) return true; // long expression text handles poorly
  return false;
}

/** Keep only complex formulas, unless `all` is set. */
export function filterComplex(items, all = false) {
  return all ? items : items.filter((it) => isComplex(it.tex));
}

/** Whether the "show everything" override is on. */
export function showAll(opts = {}) {
  return !!opts.all || /^(1|true|yes)$/i.test(process.env.CC_LATEX_ALL || "");
}
