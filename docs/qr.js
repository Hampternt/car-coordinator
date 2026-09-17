'use strict';
/* QR encoding, for putting a shared list on the printed sheet.

   Byte mode only, versions 1-20, error correction L or M — more than enough
   for a share link, and small enough to stay readable when printed at 30mm.
   Written here rather than pulled in so the printout has no dependency; the
   decoder (vendor/jsQR.js) is only loaded when someone actually scans.

   Exposed as window.QR. */

const QR = (() => {
  /* ---------- tables ----------
     Two numbers per version and level; the block layout derives from them.
     Everything else in this file is computed. */
  const ECC = {
    L: { bits: 1, perBlock: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28], blocks: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8] },
    M: { bits: 0, perBlock: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26], blocks: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16] },
  };
  const MAX_VERSION = 20;

  /* Total data+ecc modules for a version, divided by 8. The function patterns
     are a fixed shape, so this is arithmetic rather than a table. */
  function rawCodewords(ver) {
    let bits = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      bits -= (25 * n - 10) * n - 55;
      if (ver >= 7) bits -= 36;
    }
    return Math.floor(bits / 8);
  }

  function alignmentPositions(ver) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const out = [6];
    for (let pos = ver * 4 + 10; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out.sort((a, b) => a - b);
  }

  /* ---------- GF(256), primitive polynomial 0x11D ---------- */
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  /* The product of (x - a^i) for i < degree. Built up with the x^k
     coefficient at index k, then flipped to highest-degree-first and stripped
     of its leading 1, which is the order the division below consumes. */
  function generator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= mul(poly[j], EXP[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    poly.pop();
    return poly.reverse();
  }

  function remainder(data, degree) {
    const gen = generator(degree);
    const out = new Uint8Array(degree);
    for (const b of data) {
      const factor = b ^ out[0];
      out.copyWithin(0, 1);
      out[degree - 1] = 0;
      for (let i = 0; i < degree; i++) out[i] ^= mul(gen[i], factor);
    }
    return out;
  }

  /* ---------- bit stream ---------- */
  function bits(bytes, level, ver) {
    const out = [];
    const push = (value, len) => { for (let i = len - 1; i >= 0; i--) out.push((value >>> i) & 1); };
    push(4, 4);                                   // byte mode
    push(bytes.length, ver < 10 ? 8 : 16);        // character count
    for (const b of bytes) push(b, 8);

    const capacity = dataCapacity(ver, level) * 8;
    push(0, Math.min(4, capacity - out.length));  // terminator
    while (out.length % 8) out.push(0);
    const pad = [0xec, 0x11];
    for (let i = 0; out.length < capacity; i++) push(pad[i % 2], 8);

    const words = new Uint8Array(out.length / 8);
    for (let i = 0; i < out.length; i++) if (out[i]) words[i >>> 3] |= 0x80 >>> (i & 7);
    return words;
  }

  const dataCapacity = (ver, level) => rawCodewords(ver) - ECC[level].perBlock[ver - 1] * ECC[level].blocks[ver - 1];

  /* Split into blocks, add error correction, interleave. Short blocks come
     first and the long ones carry one extra data codeword. */
  function codewords(data, ver, level) {
    const numBlocks = ECC[level].blocks[ver - 1];
    const eccLen = ECC[level].perBlock[ver - 1];
    const raw = rawCodewords(ver);
    const shortLen = Math.floor(raw / numBlocks) - eccLen;
    const numShort = numBlocks - (raw % numBlocks);

    const blocks = [];
    for (let i = 0, at = 0; i < numBlocks; i++) {
      const len = shortLen + (i < numShort ? 0 : 1);
      const chunk = data.subarray(at, at + len);
      at += len;
      blocks.push({ data: chunk, ecc: remainder(chunk, eccLen) });
    }

    const out = new Uint8Array(raw);
    let at = 0;
    for (let i = 0; i <= shortLen; i++) {
      for (let b = 0; b < numBlocks; b++) {
        if (i < blocks[b].data.length) out[at++] = blocks[b].data[i];
      }
    }
    for (let i = 0; i < eccLen; i++) for (let b = 0; b < numBlocks; b++) out[at++] = blocks[b].ecc[i];
    return out;
  }

  /* ---------- matrix ---------- */

  /* Where each of the 15 format bits lives. Both copies, in bit order. The
     reservation and the drawing read from this one list, so they cannot
     drift apart and quietly overwrite a timing module. */
  function formatCells(size) {
    const cells = [];
    for (let i = 0; i <= 5; i++) cells.push([[8, i]]);
    cells.push([[8, 7]], [[8, 8]], [[7, 8]]);
    for (let i = 9; i < 15; i++) cells.push([[14 - i, 8]]);
    for (let i = 0; i < 8; i++) cells[i].push([size - 1 - i, 8]);
    for (let i = 8; i < 15; i++) cells[i].push([8, size - 15 + i]);
    return cells;
  }

  const versionCells = (size) => {
    const cells = [];
    for (let i = 0; i < 18; i++) cells.push([[Math.floor(i / 3), size - 11 + (i % 3)], [size - 11 + (i % 3), Math.floor(i / 3)]]);
    return cells;
  };

  function build(ver, level, words) {
    const size = ver * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(null));   // null = still free
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < size && y < size) m[y][x] = v; };

    // Timing first, across the whole width; the finders then overwrite the
    // corners, which is exactly what the spec draws.
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          set(cx + dx, cy + dy, d !== 2 && d <= 3);
        }
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

    const align = alignmentPositions(ver);
    for (const ay of align) {
      for (const ax of align) {
        if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }

    const format = formatCells(size);
    for (const bitCells of format) for (const [x, y] of bitCells) set(x, y, false);
    set(8, size - 8, true);                                   // always-dark module
    if (ver >= 7) for (const bitCells of versionCells(size)) for (const [x, y] of bitCells) set(x, y, false);

    // Data, zigzagging up and down two columns at a time.
    const reserved = m.map((row) => row.map((v) => v !== null));
    let bit = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;                             // skip the timing column
      for (let step = 0; step < size; step++) {
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - step : step;
        for (let c = 0; c < 2; c++) {
          const x = right - c;
          if (reserved[y][x]) continue;
          m[y][x] = bit < words.length * 8 ? ((words[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1 : false;
          bit++;
        }
      }
    }

    // Try every mask, keep the least ugly one — that is what the spec's
    // penalty rules are for.
    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const candidate = m.map((row) => row.slice());
      applyMask(candidate, reserved, mask, size);
      drawFormat(candidate, format, level, mask, size);
      if (ver >= 7) drawVersion(candidate, versionCells(size), ver);
      const score = penalty(candidate, size);
      if (!best || score < best.score) best = { score, modules: candidate };
    }
    return { size, modules: best.modules };
  }

  function applyMask(m, reserved, mask, size) {
    const rule = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x, y) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ][mask];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!reserved[y][x] && rule(x, y)) m[y][x] = !m[y][x];
  }

  /* Polynomial division in GF(2): shift the generator up to the highest set
     bit and XOR until nothing above the remainder is left. */
  function bch(data, poly, degree) {
    const width = 32 - Math.clz32(poly);
    let v = data << degree;
    for (let len = 32 - Math.clz32(v); len >= width; len = 32 - Math.clz32(v)) v ^= poly << (len - width);
    return v;
  }

  function drawFormat(m, cells, level, mask, size) {
    const data = (ECC[level].bits << 3) | mask;
    const value = ((data << 10) | bch(data, 0x537, 10)) ^ 0x5412;
    cells.forEach((bitCells, i) => {
      const on = ((value >>> i) & 1) === 1;
      for (const [x, y] of bitCells) m[y][x] = on;
    });
    m[size - 8][8] = true;
  }

  function drawVersion(m, cells, ver) {
    const value = (ver << 12) | bch(ver, 0x1f25, 12);
    cells.forEach((bitCells, i) => {
      const on = ((value >>> i) & 1) === 1;
      for (const [x, y] of bitCells) m[y][x] = on;
    });
  }

  function penalty(m, size) {
    let score = 0;
    const run = (get) => {
      for (let a = 0; a < size; a++) {
        let colour = get(a, 0), len = 1;
        const history = [];
        for (let b = 1; b < size; b++) {
          const v = get(a, b);
          if (v === colour) { len++; continue; }
          if (len >= 5) score += 3 + (len - 5);
          history.push(len);
          colour = v;
          len = 1;
        }
        if (len >= 5) score += 3 + (len - 5);
        history.push(len);
        // Rule 3: a 1:1:3:1:1 finder-like run with four modules of quiet space.
        for (let i = 0; i + 4 < history.length; i++) {
          const [h0, h1, h2, h3, h4] = history.slice(i, i + 5);
          if (h1 === h0 && h2 === h0 * 3 && h3 === h0 && h4 === h0) {
            if ((history[i - 1] || 0) >= h0 * 4 || (history[i + 5] || 0) >= h0 * 4) score += 40;
          }
        }
      }
    };
    run((y, x) => m[y][x]);
    run((x, y) => m[y][x]);

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const v = m[y][x];
        if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) score += 3;
      }
    }

    let dark = 0;
    for (const row of m) for (const v of row) if (v) dark++;
    score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return score;
  }

  /* ---------- public ---------- */
  function encode(text, level = 'M') {
    const bytes = new TextEncoder().encode(text);
    for (let ver = 1; ver <= MAX_VERSION; ver++) {
      const capacity = dataCapacity(ver, level) - (ver < 10 ? 2 : 3);   // header bytes
      if (bytes.length <= capacity) return build(ver, level, codewords(bits(bytes, level, ver), ver, level));
    }
    if (level === 'M') return encode(text, 'L');     // trade robustness for room
    throw new Error('too much data for a QR code');
  }

  /* SVG rather than a canvas: the printout goes to a laser printer, and a
     vector stays crisp at any size. */
  function svg(text, { level = 'M', quiet = 4 } = {}) {
    const { size, modules } = encode(text, level);
    const dim = size + quiet * 2;
    let path = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (modules[y][x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="Scannable copy of this list">`
      + `<rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }

  /* ---------- scanning ---------- */
  let jsQRLoading = null;
  function loadDecoder() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (jsQRLoading) return jsQRLoading;
    jsQRLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/jsQR.js';
      s.onload = () => resolve(window.jsQR);
      s.onerror = () => reject(new Error('decoder failed to load'));
      document.head.appendChild(s);
    });
    return jsQRLoading;
  }

  /* Chromium on Windows has a native detector; everywhere else falls back to
     the vendored decoder. Both take the same ImageData. */
  async function scan(imageData) {
    try {
      if ('BarcodeDetector' in window) {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) {
          const found = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(imageData);
          if (found.length) return found[0].rawValue;
        }
      }
    } catch { /* fall through to the vendored decoder */ }
    const jsQR = await loadDecoder();
    const found = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    return found ? found.data : null;
  }

  /* A photo of a printed sheet is mostly white paper; scale it down so the
     decoder is not hunting through megapixels, but never below the point
     where the modules blur together. */
  async function scanBlob(blob) {
    const bitmap = await createImageBitmap(blob);
    const attempts = [1600, 1000, 2400];
    for (const target of attempts) {
      const scale = Math.min(1, target / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, w, h);
      const found = await scan(ctx.getImageData(0, 0, w, h));
      if (found) { bitmap.close && bitmap.close(); return found; }
    }
    bitmap.close && bitmap.close();
    return null;
  }

  return { encode, svg, scan, scanBlob, loadDecoder, MAX_VERSION, _internals: { generator, remainder, bits, codewords, dataCapacity, rawCodewords, alignmentPositions, bch } };
})();
