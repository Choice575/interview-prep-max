#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const outputDir = path.join(__dirname, '..', 'assets');

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function roundedRect(pixels, size, x, y, width, height, radius, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const dx = Math.max(x + radius - px, 0, px - (x + width - radius - 1));
      const dy = Math.max(y + radius - py, 0, py - (y + height - radius - 1));
      if (dx * dx + dy * dy <= radius * radius) setPixel(pixels, size, px, py, color);
    }
  }
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  const surface = [15, 17, 23, 255];
  const panel = [25, 31, 43, 255];
  const accent = [0, 201, 169, 255];
  const highlight = [225, 255, 250, 255];

  roundedRect(pixels, size, 0, 0, size, size, Math.round(size * 0.19), surface);
  const inset = Math.round(size * 0.15);
  roundedRect(pixels, size, inset, inset, size - inset * 2, size - inset * 2, Math.round(size * 0.09), panel);

  const line = Math.max(5, Math.round(size * 0.055));
  const startX = Math.round(size * 0.29);
  const centerY = Math.round(size * 0.5);
  for (let step = 0; step < Math.round(size * 0.16); step += 1) {
    for (let thickness = 0; thickness < line; thickness += 1) {
      setPixel(pixels, size, startX + step, centerY - step + thickness, accent);
      setPixel(pixels, size, startX + step, centerY + step - thickness, accent);
    }
  }
  const promptX = startX + Math.round(size * 0.19);
  const promptY = Math.round(size * 0.62);
  for (let px = promptX; px < Math.round(size * 0.69); px += 1) {
    for (let thickness = 0; thickness < line; thickness += 1) setPixel(pixels, size, px, promptY + thickness, highlight);
  }

  const rows = [];
  for (let y = 0; y < size; y += 1) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4)]));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(outputDir, { recursive: true });
[192, 512].forEach(size => fs.writeFileSync(path.join(outputDir, `icon-${size}.png`), drawIcon(size)));
