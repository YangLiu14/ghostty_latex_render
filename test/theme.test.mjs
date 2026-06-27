import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseOscColor,
  buildTheme,
  blend,
  luminance,
  rgbToHex,
} from "../src/theme.mjs";

test("parseOscColor: 16-bit and 8-bit replies", () => {
  assert.equal(parseOscColor("\x1b]11;rgb:1a1a/1a1a/1a1a\x07"), "#1a1a1a");
  assert.equal(parseOscColor("rgb:ff/80/00"), "#ff8000");
  assert.equal(parseOscColor("garbage"), null);
});

test("rgbToHex pads components", () => {
  assert.equal(rgbToHex(0, 128, 255), "#0080ff");
});

test("blend mixes endpoints", () => {
  assert.equal(blend("#000000", "#ffffff", 0), "#000000");
  assert.equal(blend("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(blend("#000000", "#ffffff", 0.5), "#808080");
});

test("buildTheme picks dark/light accent and derives muted tones", () => {
  const dark = buildTheme("#1a1a1a", "#e6e6e6");
  assert.equal(dark.isDark, true);
  assert.equal(dark.accent, "#7dcfff");

  const light = buildTheme("#ffffff", "#202020");
  assert.equal(light.isDark, false);
  assert.equal(light.accent, "#2563eb");

  // dim is between fg and bg.
  const lum = (h) => luminance(h);
  assert.ok(lum(dark.dim) < lum(dark.fg) && lum(dark.dim) > lum(dark.bg));
});

test("buildTheme falls back to defaults when given nothing", () => {
  const t = buildTheme();
  assert.equal(t.bg, "#1a1a1a");
  assert.equal(t.fg, "#e6e6e6");
});
