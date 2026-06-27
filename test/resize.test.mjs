import { test } from "node:test";
import assert from "node:assert/strict";
import { fitTargetCols } from "../src/preview.mjs";

test("fitTargetCols: 1/3 of window = 2/3 of a 50% pane", () => {
  assert.equal(fitTargetCols(120), 80); // 120 -> 80 cols
  assert.equal(fitTargetCols(80), 53); // round(80 * 2/3)
  assert.equal(fitTargetCols(90), 60);
});

test("fitTargetCols: custom fraction", () => {
  // a quarter of the window from a 50% pane -> half the pane
  assert.equal(fitTargetCols(80, 1 / 4), 40);
});
