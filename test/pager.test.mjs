import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextIndex,
  rowToIndex,
  decodeInput,
  snippet,
} from "../src/preview.mjs";

test("nextIndex wraps both directions", () => {
  assert.equal(nextIndex(0, 1, 3), 1);
  assert.equal(nextIndex(2, 1, 3), 0); // wrap forward
  assert.equal(nextIndex(0, -1, 3), 2); // wrap backward
  assert.equal(nextIndex(0, 1, 1), 0); // single item stays
});

test("rowToIndex maps menu rows (menu starts at row 4)", () => {
  assert.equal(rowToIndex(4, 5), 0); // first item
  assert.equal(rowToIndex(5, 5), 1);
  assert.equal(rowToIndex(8, 5), 4); // last item
  assert.equal(rowToIndex(9, 5), -1); // below menu
  assert.equal(rowToIndex(1, 5), -1); // header rows
});

test("decodeInput: keys", () => {
  assert.deepEqual(decodeInput("j"), { kind: "move", delta: 1 });
  assert.deepEqual(decodeInput("k"), { kind: "move", delta: -1 });
  assert.deepEqual(decodeInput("\x1b[B"), { kind: "move", delta: 1 });
  assert.deepEqual(decodeInput("\x1b[A"), { kind: "move", delta: -1 });
  assert.deepEqual(decodeInput("\x1b[C"), { kind: "move", delta: 1 });
  assert.deepEqual(decodeInput("\x1b[D"), { kind: "move", delta: -1 });
  assert.deepEqual(decodeInput("3"), { kind: "jump", index: 2 });
  assert.deepEqual(decodeInput("y"), { kind: "copy" });
  assert.deepEqual(decodeInput("q"), { kind: "quit" });
  assert.deepEqual(decodeInput("\x03"), { kind: "quit" });
  assert.equal(decodeInput("z"), null);
});

test("decodeInput: SGR left-click yields the clicked row", () => {
  assert.deepEqual(decodeInput("\x1b[<0;12;4M"), { kind: "clickRow", y: 4 });
  assert.equal(decodeInput("\x1b[<2;12;4M"), null); // right button ignored
});

test("snippet collapses whitespace and truncates", () => {
  assert.equal(snippet("a   +\n  b", 80), "a + b");
  assert.equal(snippet("abcdefghij", 5), "abcd…");
});
