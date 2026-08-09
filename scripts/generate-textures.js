// Generates the three theme background textures (paper / stone / noise) as
// tileable PNGs in public/images/. Pure Node, zero dependencies (zlib only).
//
// Usage: node scripts/generate-textures.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'public', 'images');

// ---------------------------------------------------------------------------
// PNG encoding (8-bit, filter 0 per scanline, zlib-deflated IDAT)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

// colorType: 2 = RGB, 6 = RGBA. pixels: raw interleaved channel bytes.
function encodePng(width, height, colorType, pixels) {
  const bpp = colorType === 6 ? 4 : 3;
  if (pixels.length !== width * height * bpp) {
    throw new Error(`pixel buffer size mismatch: got ${pixels.length}, want ${width * height * bpp}`);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  const stride = 1 + width * bpp;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: None
    pixels.copy(raw, y * stride + 1, y * width * bpp, (y + 1) * width * bpp);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Deterministic RNG + tileable value noise (wrap-around lattice, bilinear)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One octave of tileable value noise: a random lattice wrapped in both axes,
// bilinearly interpolated. Result is centered on 0 with amplitude ~±amp.
function noiseOctave(rand, width, height, cells, amp) {
  const lat = [];
  for (let j = 0; j < cells; j++) {
    const row = new Float32Array(cells);
    for (let i = 0; i < cells; i++) row[i] = (rand() * 2 - 1) * amp;
    lat.push(row);
  }
  const scale = cells / width;
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = y * scale;
    const j0 = Math.floor(gy) % cells;
    const j1 = (j0 + 1) % cells;
    const ty = gy - Math.floor(gy);
    for (let x = 0; x < width; x++) {
      const gx = x * scale;
      const i0 = Math.floor(gx) % cells;
      const i1 = (i0 + 1) % cells;
      const tx = gx - Math.floor(gx);
      const v00 = lat[j0][i0], v01 = lat[j0][i1];
      const v10 = lat[j1][i0], v11 = lat[j1][i1];
      const top = v00 + (v01 - v00) * tx;
      const bot = v10 + (v11 - v10) * tx;
      out[y * width + x] = top + (bot - top) * ty;
    }
  }
  return out;
}

function sumOctaves(rand, width, height, octaves) {
  const sum = new Float32Array(width * height);
  for (const o of octaves) {
    const n = noiseOctave(rand, width, height, o.cells, o.amp);
    for (let i = 0; i < sum.length; i++) sum[i] += n[i];
  }
  return sum;
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

// ---------------------------------------------------------------------------
// Texture builders
// ---------------------------------------------------------------------------

// Subtle parchment grain: near-white warm base, gentle low-frequency mottling.
function makePaper(rand, width, height) {
  const base = [244, 232, 193];
  const n = sumOctaves(rand, width, height, [
    { cells: 8, amp: 4 },   // very soft large blotches
    { cells: 16, amp: 6 },  // main grain
    { cells: 32, amp: 3 },  // fine fibre detail
  ]);
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const d = n[i];
    px[i * 3] = clamp255(base[0] + d);
    px[i * 3 + 1] = clamp255(base[1] + d);
    px[i * 3 + 2] = clamp255(base[2] + d);
  }
  return px;
}

// Dark rock: near-black warm base with mottled mid-gray variation, gritty.
function makeStone(rand, width, height) {
  const base = [34, 31, 27];
  const n = sumOctaves(rand, width, height, [
    { cells: 8, amp: 11 },  // large rock patches
    { cells: 16, amp: 17 }, // main mottling
    { cells: 32, amp: 4 },  // surface detail
    { cells: 64, amp: 2 },  // fine grit
  ]);
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const d = n[i];
    px[i * 3] = clamp255(base[0] + d);
    px[i * 3 + 1] = clamp255(base[1] + d);
    px[i * 3 + 2] = clamp255(base[2] + d);
  }
  return px;
}

// Film grain: per-pixel random monochrome speckle. R=G=B=A (identical bytes
// per pixel) so the theme's background color still shows through the alpha,
// and the identical-run bytes deflate far better than raw RGBA randomness.
function makeNoise(rand, width, height) {
  const px = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = Math.floor(rand() * 256);
    px[i * 4] = v;
    px[i * 4 + 1] = v;
    px[i * 4 + 2] = v;
    px[i * 4 + 3] = v;
  }
  return px;
}

// ---------------------------------------------------------------------------
// Write + self-verify (parse back, inflate IDAT, compare raw scanlines)
// ---------------------------------------------------------------------------

function parsePng(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('bad PNG signature');
  const chunks = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    const crc = buf.readUInt32BE(off + 8 + len);
    if (crc !== crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]))) {
      throw new Error(`bad CRC for chunk ${type}`);
    }
    chunks.push({ type, data });
    off += 12 + len;
  }
  return chunks;
}

function verify(width, height, colorType, pixels, file) {
  const buf = fs.readFileSync(file);
  const chunks = parsePng(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  if (ihdr.readUInt32BE(0) !== width || ihdr.readUInt32BE(4) !== height) {
    throw new Error(`${file}: IHDR dimensions mismatch`);
  }
  if (ihdr[9] !== colorType) throw new Error(`${file}: color type mismatch`);
  const raw = zlib.inflateSync(chunks.find((c) => c.type === 'IDAT').data);
  const bpp = colorType === 6 ? 4 : 3;
  const expected = Buffer.alloc(height * (1 + width * bpp));
  for (let y = 0; y < height; y++) {
    expected[y * (1 + width * bpp)] = 0;
    pixels.copy(expected, y * (1 + width * bpp) + 1, y * width * bpp, (y + 1) * width * bpp);
  }
  if (!raw.equals(expected)) throw new Error(`${file}: decoded pixels mismatch`);
  console.log(`  OK  ${path.basename(file)}  ${buf.length} bytes  ${width}x${height}  type ${colorType}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const SEED = 0xC0FFEE;
const TEX = [
  { name: 'paper-texture.png', width: 128, height: 128, colorType: 2, make: makePaper },
  { name: 'stone-texture.png', width: 96, height: 96, colorType: 2, make: makeStone },
  { name: 'noise.png', width: 64, height: 64, colorType: 6, make: makeNoise },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const t of TEX) {
  const rand = mulberry32(SEED + TEX.indexOf(t));
  const pixels = t.make(rand, t.width, t.height);
  const file = path.join(OUT_DIR, t.name);
  fs.writeFileSync(file, encodePng(t.width, t.height, t.colorType, pixels));
  verify(t.width, t.height, t.colorType, pixels, file);
}

console.log('All textures generated and verified.');
