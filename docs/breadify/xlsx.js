// Reading an .xlsx in the browser, with nothing installed.
//
// The export is an OOXML zip: a few XML parts, deflated. Chromium and Edge
// ship `DecompressionStream('deflate-raw')` and `DOMParser`, which between
// them are a whole spreadsheet reader — so this file is the dependency the
// Rust app spent `calamine` on, and the page still has no build step.
//
// Only what the export actually uses is implemented: one sheet, a shared
// string table, no styles that carry meaning. See docs/excel-format.md in the
// Breadify repo for why that is enough.

'use strict';

const Xlsx = (() => {
  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_SIGNATURE = 0x02014b50;
  const LOCAL_SIGNATURE = 0x04034b50;
  // End of central directory: 22 bytes, plus up to 64 KB of trailing comment.
  const EOCD_MIN = 22;

  /** One file inside the zip, as the central directory describes it. */
  function centralDirectory(view, bytes) {
    const start = endOfCentralDirectory(view, bytes.length);
    const count = view.getUint16(start + 10, true);
    let at = view.getUint32(start + 16, true);

    const entries = new Map();
    for (let index = 0; index < count; index += 1) {
      if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
        throw new Error('the zip directory is damaged');
      }
      const method = view.getUint16(at + 10, true);
      const compressed = view.getUint32(at + 20, true);
      const uncompressed = view.getUint32(at + 24, true);
      const nameLength = view.getUint16(at + 28, true);
      const extraLength = view.getUint16(at + 30, true);
      const commentLength = view.getUint16(at + 32, true);
      const localOffset = view.getUint32(at + 42, true);
      const name = new TextDecoder().decode(
        bytes.subarray(at + 46, at + 46 + nameLength),
      );

      entries.set(name, { method, compressed, uncompressed, localOffset });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  /** The comment field means the record has to be found by scanning back. */
  function endOfCentralDirectory(view, length) {
    for (let at = length - EOCD_MIN; at >= 0; at -= 1) {
      if (view.getUint32(at, true) === EOCD_SIGNATURE) return at;
    }
    throw new Error('not a zip file — no end-of-central-directory record');
  }

  /**
   * One entry's bytes. The local header repeats the sizes, but a writer is
   * allowed to leave them zero and put them in a trailing descriptor instead,
   * so the central directory's copy is the one to trust.
   */
  async function read(view, bytes, entry) {
    const { localOffset } = entry;
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error('the zip is damaged — a local file header is missing');
    }
    const nameLength = view.getUint16(localOffset + 26, true);
    const extraLength = view.getUint16(localOffset + 28, true);
    const from = localOffset + 30 + nameLength + extraLength;
    const raw = bytes.subarray(from, from + entry.compressed);

    if (entry.method === 0) return raw;
    if (entry.method !== 8) {
      throw new Error(`unsupported compression method ${entry.method}`);
    }
    return inflate(raw);
  }

  async function inflate(raw) {
    const stream = new Blob([raw])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Every part of the workbook this reader needs, as parsed XML. */
  async function parts(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const entries = centralDirectory(view, bytes);
    const decoder = new TextDecoder();

    async function xml(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      const text = decoder.decode(await read(view, bytes, entry));
      const document = new DOMParser().parseFromString(text, 'application/xml');
      if (document.querySelector('parsererror')) {
        throw new Error(`${name} is not valid XML`);
      }
      return document;
    }

    return { entries, xml };
  }

  /**
   * Which file holds which sheet. The workbook names its sheets and points at
   * them by relationship id; the rels part turns that id into a filename.
   */
  function sheetFiles(workbook, rels) {
    const targets = new Map();
    for (const relationship of rels.getElementsByTagName('Relationship')) {
      let target = relationship.getAttribute('Target') || '';
      if (target.startsWith('/xl/')) target = target.slice(4);
      else if (target.startsWith('/')) target = target.slice(1);
      targets.set(relationship.getAttribute('Id'), target);
    }

    const files = new Map();
    for (const sheet of workbook.getElementsByTagName('sheet')) {
      const id =
        sheet.getAttribute('r:id') ||
        sheet.getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'id',
        );
      const target = targets.get(id);
      if (target) files.set(sheet.getAttribute('name'), `xl/${target}`);
    }
    return files;
  }

  /**
   * The shared string table. A string may be split into styled runs, so the
   * value is every `t` under the entry joined — never just the first.
   */
  function sharedStrings(document) {
    if (!document) return [];
    return Array.from(document.getElementsByTagName('si'), (entry) =>
      Array.from(entry.getElementsByTagName('t'))
        // A run's own `rPh` phonetics carry `t` too; they are not the string.
        .filter((node) => node.parentNode.nodeName !== 'rPh')
        .map((node) => node.textContent)
        .join(''),
    );
  }

  /** `BC12` -> 54. Column letters are base-26 with no zero. */
  function columnIndex(reference) {
    let index = 0;
    for (const character of reference) {
      const code = character.charCodeAt(0);
      if (code < 65 || code > 90) break;
      index = index * 26 + (code - 64);
    }
    return index - 1;
  }

  /**
   * One cell's value, as the type attribute says to read it.
   *
   * An absent cell is absent, never an empty string — `Department` and
   * `Comment` are missing entirely on most rows, and the difference matters.
   */
  function cellValue(cell, strings) {
    const type = cell.getAttribute('t');
    if (type === 'inlineStr') {
      const inline = cell.getElementsByTagName('is')[0];
      return inline ? { kind: 'text', value: inline.textContent } : null;
    }

    const holder = cell.getElementsByTagName('v')[0];
    if (!holder) return null;
    const raw = holder.textContent;

    switch (type) {
      case 's': {
        const index = Number(raw);
        return { kind: 'text', value: strings[index] ?? '' };
      }
      case 'b':
        // A genuine Excel boolean, which is what `Accept alternatives` is.
        return { kind: 'boolean', value: raw === '1' };
      case 'e':
        return { kind: 'error', value: raw };
      case 'str':
        return { kind: 'text', value: raw };
      default: {
        const number = Number(raw);
        return Number.isNaN(number)
          ? { kind: 'text', value: raw }
          : { kind: 'number', value: number };
      }
    }
  }

  /** A worksheet as rows of cells, each row keyed by column index. */
  function readSheet(document, strings) {
    const rows = [];
    let widest = 0;

    for (const row of document.getElementsByTagName('row')) {
      const number = Number(row.getAttribute('r'));
      const cells = new Map();
      for (const cell of row.getElementsByTagName('c')) {
        const reference = cell.getAttribute('r') || '';
        const value = cellValue(cell, strings);
        if (value === null) continue;
        const column = columnIndex(reference);
        cells.set(column, value);
        if (column + 1 > widest) widest = column + 1;
      }
      rows.push({ number, cells });
    }

    const dimension = document.getElementsByTagName('dimension')[0];
    return {
      rows,
      width: widest,
      dimension: dimension ? dimension.getAttribute('ref') : null,
    };
  }

  /**
   * Opens a workbook.
   *
   * Returns `{ sheetNames, sheet(name) }` — the sheet is read lazily, because
   * the export has exactly one and reading the rest would be waste.
   */
  async function open(buffer) {
    const { entries, xml } = await parts(buffer);
    const workbook = await xml('xl/workbook.xml');
    if (!workbook) throw new Error('not a workbook — xl/workbook.xml is missing');

    const rels = await xml('xl/_rels/workbook.xml.rels');
    const files = rels ? sheetFiles(workbook, rels) : new Map();
    if (files.size === 0) {
      // A workbook with no rels part is not something this exporter makes, but
      // guessing sheet1.xml costs nothing and beats refusing the file.
      for (const sheet of workbook.getElementsByTagName('sheet')) {
        files.set(sheet.getAttribute('name'), 'xl/worksheets/sheet1.xml');
        break;
      }
    }

    const strings = sharedStrings(await xml('xl/sharedStrings.xml'));

    return {
      sheetNames: Array.from(files.keys()),
      async sheet(name) {
        const file = files.get(name);
        if (!file || !entries.has(file)) return null;
        return readSheet(await xml(file), strings);
      },
    };
  }

  return { open, columnIndex };
})();

if (typeof module !== 'undefined') module.exports = Xlsx;
