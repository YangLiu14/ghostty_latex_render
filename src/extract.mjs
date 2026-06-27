// Extract LaTeX math from a markdown answer.
//
// Handles: $$...$$ and \[...\] (block), $...$ and \(...\) (inline).
// Excludes: fenced code blocks (``` / ~~~) and inline code spans (`...`).
// Respects backslash escapes (e.g. a literal \$ is not a delimiter).
//
// The single-$ inline rule follows pandoc's heuristic to avoid treating
// prose like "it costs $5 and $10" as math:
//   - the opening $ must be immediately followed by a non-space char
//   - the closing $ must be immediately preceded by a non-space char
//     and not immediately followed by a digit.

/** Blank out fenced code blocks, keeping newlines so offsets/lines stay sane. */
function maskFencedCode(text) {
  const lines = text.split("\n");
  let fence = null; // the fence marker that opened the current block
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(```+|~~~+)/);
    if (fence === null) {
      if (m) {
        fence = m[1][0]; // ` or ~
        lines[i] = "";
      }
    } else {
      const closing = lines[i].match(/^\s*(```+|~~~+)/);
      lines[i] = "";
      if (closing && closing[1][0] === fence) fence = null;
    }
  }
  return lines.join("\n");
}

/**
 * @param {string} md
 * @returns {{type:'block'|'inline', tex:string}[]}
 */
export function extractMath(md) {
  if (!md) return [];
  const text = maskFencedCode(md);
  const out = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const c = text[i];

    // Backslash: either a \[ \] / \( \) delimiter, or an escape we skip.
    if (c === "\\") {
      const next = text[i + 1];
      if (next === "[" || next === "(") {
        const close = next === "[" ? "\\]" : "\\)";
        const end = text.indexOf(close, i + 2);
        if (end !== -1) {
          const tex = text.slice(i + 2, end).trim();
          if (tex) out.push({ type: next === "[" ? "block" : "inline", tex });
          i = end + 2;
          continue;
        }
      }
      i += 2; // skip the escaped pair (or trailing backslash)
      continue;
    }

    // Inline code span: skip to the matching backtick run.
    if (c === "`") {
      let run = 1;
      while (text[i + run] === "`") run++;
      const ticks = "`".repeat(run);
      const end = text.indexOf(ticks, i + run);
      i = end === -1 ? n : end + run;
      continue;
    }

    if (c === "$") {
      // Block math $$...$$
      if (text[i + 1] === "$") {
        const end = text.indexOf("$$", i + 2);
        if (end !== -1) {
          const tex = text.slice(i + 2, end).trim();
          if (tex) out.push({ type: "block", tex });
          i = end + 2;
          continue;
        }
        i += 2;
        continue;
      }
      // Inline math $...$ with pandoc-style guards.
      const after = text[i + 1];
      if (after && !/\s/.test(after)) {
        let j = i + 1;
        while (j < n) {
          if (text[j] === "\\") { j += 2; continue; }
          if (text[j] === "$") {
            const before = text[j - 1];
            const follow = text[j + 1];
            if (!/\s/.test(before) && !/\d/.test(follow || "")) break;
          }
          j++;
        }
        if (j < n && text[j] === "$") {
          const tex = text.slice(i + 1, j).trim();
          if (tex) out.push({ type: "inline", tex });
          i = j + 1;
          continue;
        }
      }
    }

    i++;
  }

  return out;
}
