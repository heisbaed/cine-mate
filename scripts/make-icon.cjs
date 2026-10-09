// Generates assets/cine.png (256x256 robot face) and build/cine.ico (PNG-compressed ICO).
// Pure Node, zero dependencies.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 256;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// RGBA canvas, transparent black start.
const px = Buffer.alloc(SIZE * SIZE * 4);

function blend(x, y, r, g, b, a) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= SIZE || yi >= SIZE) return;
  const i = (yi * SIZE + xi) * 4;
  const sa = a / 255;
  const da = px[i + 3] / 255;
  const out = sa + da * (1 - sa);
  if (out <= 0) return;
  px[i] = Math.round((r * sa + px[i] * da * (1 - sa)) / out);
  px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / out);
  px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / out);
  px[i + 3] = Math.round(out * 255);
}

function disc(cx, cy, rad, r, g, b, a) {
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) blend(x, y, r, g, b, a);
    }
  }
}

function rect(x0, y0, x1, y1, r, g, b, a) {
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x0) + 0 || x < Math.ceil(x1); x++) {
      blend(x, y, r, g, b, a);
    }
  }
}

function roundedRect(x0, y0, x1, y1, rad, r, g, b, a) {
  rect(x0 + rad, y0, x1 - rad, y1, r, g, b, a);
  rect(x0, y0 + rad, x1, y1 - rad, r, g, b, a);
  disc(x0 + rad, y0 + rad, rad, r, g, b, a);
  disc(x1 - rad, y0 + rad, rad, r, g, b, a);
  disc(x0 + rad, y1 - rad, rad, r, g, b, a);
  disc(x1 - rad, y1 - rad, rad, r, g, b, a);
}

function ring(cx, cy, rad, thick, r, g, b, a) {
  for (let y = Math.floor(cy - rad - thick); y <= Math.ceil(cy + rad + thick); y++) {
    for (let x = Math.floor(cx - rad - thick); x <= Math.ceil(cx + rad + thick); x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (Math.abs(d - rad) <= thick / 2) blend(x, y, r, g, b, a);
    }
  }
}

// Antenna stem + glowing tip.
rect(124, 18, 132, 46, 58, 70, 86, 255);
disc(128, 14, 9, 52, 224, 161, 255);
ring(128, 14, 13, 3, 52, 224, 161, 90);

// Screen face.
roundedRect(38, 48, 218, 178, 30, 10, 18, 32, 255);
ring(128, 113, 96, 2, 214, 179, 90, 60);

// Eyes with glow halos.
for (const ex of [92, 164]) {
  disc(ex, 112, 22, 77, 159, 255, 60);
  disc(ex, 112, 15, 127, 216, 255, 255);
  disc(ex, 112, 7, 235, 250, 255, 255);
}

// Torso strip + gold light bar.
roundedRect(88, 188, 168, 214, 10, 35, 45, 62, 255);
rect(100, 198, 156, 204, 214, 179, 90, 255);

// Wheel base.
roundedRect(78, 222, 178, 238, 8, 22, 29, 41, 255);
rect(92, 228, 164, 231, 77, 159, 255, 220);

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
]);

const root = __dirname + path.sep + '..';
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'assets', 'cine.png'), png);

// ICO container wrapping the PNG (valid for 256x256 on Vista+).
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0;
entry[1] = 0;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16, 12);
fs.writeFileSync(path.join(root, 'build', 'cine.ico'), Buffer.concat([header, entry, png]));
console.log('wrote assets/cine.png (%d bytes) and build/cine.ico (%d bytes)', png.length, 6 + 16 + png.length);
