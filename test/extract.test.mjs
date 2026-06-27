import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMath } from "../src/extract.mjs";

test("block $$ and inline $", () => {
  const r = extractMath("Here $$a^2+b^2=c^2$$ and inline $x_i$ done.");
  assert.deepEqual(r, [
    { type: "block", tex: "a^2+b^2=c^2" },
    { type: "inline", tex: "x_i" },
  ]);
});

test("\\[ \\] and \\( \\) delimiters", () => {
  const r = extractMath("Block \\[ E=mc^2 \\] and \\( v(s) \\) end.");
  assert.deepEqual(r, [
    { type: "block", tex: "E=mc^2" },
    { type: "inline", tex: "v(s)" },
  ]);
});

test("ignores $ inside fenced code", () => {
  const md = "text\n```bash\necho $HOME and $PATH\n```\nreal $y=2$ here";
  assert.deepEqual(extractMath(md), [{ type: "inline", tex: "y=2" }]);
});

test("ignores $ inside inline code", () => {
  assert.deepEqual(extractMath("use `$VAR` then $z=1$"), [
    { type: "inline", tex: "z=1" },
  ]);
});

test("pandoc guards: prices are not math", () => {
  assert.deepEqual(extractMath("it costs $5 and $10 total"), []);
});

test("escaped \\$ is literal", () => {
  assert.deepEqual(extractMath("price is \\$5 not math"), []);
});

test("multiline block math", () => {
  const md = "$$\n\\sum_{i=1}^n i = \\frac{n(n+1)}{2}\n$$";
  assert.deepEqual(extractMath(md), [
    { type: "block", tex: "\\sum_{i=1}^n i = \\frac{n(n+1)}{2}" },
  ]);
});

test("empty and null input", () => {
  assert.deepEqual(extractMath(""), []);
  assert.deepEqual(extractMath(null), []);
});
