import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';

/**
 * School-office CSV exports (Excel "Save As CSV" in particular) are
 * frequently not UTF-8 - a common failure mode this importer needs to
 * survive is Arabic name columns turning into mojibake because the file
 * was saved as UTF-16 or a legacy Windows codepage. This sniffs the BOM
 * first (authoritative when present), then falls back to "does this decode
 * as clean UTF-8" and finally assumes Windows-1256 (the standard Arabic
 * Windows codepage) as the last resort rather than silently corrupting
 * Arabic text.
 */
export function decodeUpload(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return iconv.decode(buffer.subarray(2), 'utf-16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return iconv.decode(buffer.subarray(2), 'utf-16be');
  }

  // `fatal: true` makes TextDecoder throw on genuinely invalid UTF-8 byte
  // sequences instead of silently substituting U+FFFD - that's the signal
  // to fall back to win1256. Checking the decoded *string* for U+FFFD
  // instead (e.g. `buffer.toString('utf8').includes('�')`) would give
  // a false positive if the file legitimately contains that character, and
  // wrongly re-decode an already-correct UTF-8 file as win1256.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, 'win1256');
  }
}

export interface CsvRow {
  /** 1-indexed, matching the actual line in the uploaded file (header is line 1) - used in error messages. */
  lineNumber: number;
  fields: Record<string, string>;
}

/**
 * Parses already-decoded CSV text into header-keyed rows. Blank lines are
 * dropped silently (not treated as data). `relax_column_count` means a row
 * with extra columns beyond the header just has them ignored, and a row
 * with fewer columns gets `undefined` for the missing ones, instead of
 * either throwing or shifting every other column's data sideways.
 */
export function parseCsv(text: string): CsvRow[] {
  const records: Record<string, string>[] = parse(text, {
    columns: (header: string[]) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  });
  return records.map((fields, i) => ({ lineNumber: i + 2, fields }));
}
