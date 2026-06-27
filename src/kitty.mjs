// Minimal Kitty graphics protocol emitter (supported by Ghostty).
// Reference: https://sw.kovidgoyal.net/kitty/graphics-protocol/
//
// A PNG is base64-encoded and sent in <=4096-byte chunks wrapped in
// APC escapes:  ESC _ G <key=val,...> ; <payload> ESC \

const ESC = "\x1b";
const CHUNK = 4096;

/** Display a PNG buffer inline. `cols`/`rows` set the cell box (aspect kept if only one given). */
export function displayPng(png, { cols, rows, stream = process.stdout } = {}) {
  const b64 = png.toString("base64");
  // a=T transmit+display, f=100 PNG, q=2 suppress responses, c/r = size in cells.
  const ctrl = ["a=T", "f=100", "q=2"];
  if (cols) ctrl.push(`c=${cols}`);
  if (rows) ctrl.push(`r=${rows}`);

  let pos = 0;
  let first = true;
  while (pos < b64.length) {
    const piece = b64.slice(pos, pos + CHUNK);
    pos += CHUNK;
    const more = pos < b64.length ? 1 : 0;
    const keys = first ? `${ctrl.join(",")},m=${more}` : `m=${more}`;
    stream.write(`${ESC}_G${keys};${piece}${ESC}\\`);
    first = false;
  }
}

/** Delete all images currently placed on screen. */
export function deleteAllImages(stream = process.stdout) {
  stream.write(`${ESC}_Ga=d${ESC}\\`);
}

/** Clear text + scrollback and move cursor home. */
export function clearScreen(stream = process.stdout) {
  stream.write(`${ESC}[2J${ESC}[3J${ESC}[H`);
}
