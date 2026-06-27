import { test } from "node:test";
import assert from "node:assert/strict";
import { isComplex, filterComplex } from "../src/complexity.mjs";

test("trivial formulas are skipped", () => {
  for (const t of [
    "x",
    "\\pi",
    "\\gamma",
    "x_i",
    "s_0",
    "x^2",
    "ab",
    "2x",
    "xy",
    "a\\cdot b",
    "a+b",
    "a=b",
    "F=ma",
    "\\pi r^2",
    "\\mathbb{E}",
  ]) {
    assert.equal(isComplex(t), false, `expected trivial: ${t}`);
  }
});

test("complex formulas are shown", () => {
  for (const t of [
    "\\frac{a}{b}",
    "\\sum_{i=1}^n i",
    "\\int_0^1 x\\,dx",
    "\\sqrt{x+1}",
    "E=mc^2", // relation + script
    "y = x^2 + 1", // relation + ops
    "a+b+c", // multi-term
    "x_{ij}", // braced multi-char subscript
    "\\theta_{t+1}", // braced subscript expression
    "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}",
    "V(s)=\\mathbb{E}\\left[\\sum_t \\gamma^t r_t\\right]",
    "a \\leq b \\leq c", // chained relations
  ]) {
    assert.equal(isComplex(t), true, `expected complex: ${t}`);
  }
});

test("filterComplex keeps complex, drops trivial; all=true keeps everything", () => {
  const items = [
    { type: "inline", tex: "x" },
    { type: "block", tex: "\\frac{a}{b}" },
    { type: "inline", tex: "s_0" },
  ];
  assert.deepEqual(filterComplex(items), [{ type: "block", tex: "\\frac{a}{b}" }]);
  assert.equal(filterComplex(items, true).length, 3);
});
