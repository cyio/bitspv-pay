/**
 * jsQR decode test — reads raw RGBA from stdin, runs multiple strategies.
 * Usage: python3 scripts/dump-png.py | node scripts/test-jsqr.mjs
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const jsQR = require('jsqr');

const raw = readFileSync('/tmp/qr_test_rgba.bin');
const meta = JSON.parse(readFileSync('/tmp/qr_test_meta.json', 'utf8'));
const { width, height } = meta;

function attempt(label, data, w, h) {
  const arr = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const result = jsQR(arr, w, h);
  console.log(`[${label}] ${result ? '✅ PASS: ' + result.data.slice(0, 40) + '…' : '❌ FAIL'}`);
  return result;
}

// --- strategy 1: full image, no processing ---
attempt('full-image', raw, width, height);

// --- strategy 2: contrast boost (in-place) ---
const contrast = Buffer.from(raw);
for (let i = 0; i < contrast.length; i += 4) {
  for (let c = 0; c < 3; c++) {
    let v = contrast[i + c];
    v = ((v / 255 - 0.5) * 1.5 + 0.5) * 255;
    contrast[i + c] = Math.min(255, Math.max(0, v));
  }
}
attempt('contrast-1.5', contrast, width, height);

// --- strategy 3: grayscale threshold (binary) ---
const binary = Buffer.from(raw);
for (let i = 0; i < binary.length; i += 4) {
  const gray = 0.299 * binary[i] + 0.587 * binary[i+1] + 0.114 * binary[i+2];
  const v = gray > 128 ? 255 : 0;
  binary[i] = binary[i+1] = binary[i+2] = v;
}
attempt('binary-threshold', binary, width, height);

// --- strategy 4: crop center QR region (heuristic: middle 60% of image) ---
const cx = Math.floor(width * 0.2);
const cy = Math.floor(height * 0.15);
const cw = Math.floor(width * 0.6);
const ch = Math.floor(height * 0.7);
const cropped = Buffer.alloc(cw * ch * 4);
for (let row = 0; row < ch; row++) {
  const srcOff = ((cy + row) * width + cx) * 4;
  const dstOff = row * cw * 4;
  raw.copy(cropped, dstOff, srcOff, srcOff + cw * 4);
}
attempt(`crop-${cx},${cy},${cw}x${ch}`, cropped, cw, ch);

// --- strategy 5: tight QR crop (eyeballed from the screenshot) ---
// QR code appears at roughly x:200-650, y:200-660 in the 858x764 image
const qx = 200, qy = 200, qw = 450, qh = 460;
const qcrop = Buffer.alloc(qw * qh * 4);
for (let row = 0; row < qh; row++) {
  const srcOff = ((qy + row) * width + qx) * 4;
  const dstOff = row * qw * 4;
  raw.copy(qcrop, dstOff, srcOff, srcOff + qw * 4);
}
attempt(`tight-crop-${qx},${qy},${qw}x${qh}`, qcrop, qw, qh);
