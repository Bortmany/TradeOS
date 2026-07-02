// Dependency-free RFC-4180 CSV parser.
//
// Handles:
//  - quoted fields ("...") with embedded commas, quotes ("" escape), and newlines
//  - both LF ("\n") and CRLF ("\r\n") line endings
//  - a leading UTF-8 BOM (stripped if present)
//  - a trailing newline (does not emit a phantom empty row)
//
// It is intentionally lenient: bare quotes inside unquoted fields are kept
// verbatim rather than throwing, since real broker exports are frequently messy.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let sawAnyChar = false; // did the current record contain any content at all?

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
    sawAnyChar = false;
  };

  const len = text.length;
  for (let i = 0; i < len; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false; // closing quote
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      sawAnyChar = true;
      continue;
    }

    if (ch === ",") {
      sawAnyChar = true;
      pushField();
      continue;
    }

    if (ch === "\n") {
      pushRecord();
      continue;
    }

    if (ch === "\r") {
      // Consume the following "\n" of a CRLF pair (if any).
      if (text[i + 1] === "\n") i++;
      pushRecord();
      continue;
    }

    field += ch;
    sawAnyChar = true;
  }

  // Flush the final record if the file didn't end with a newline, or if we ended
  // mid-field. Skip a trailing empty record produced by a terminal newline.
  if (sawAnyChar || field.length > 0 || record.length > 0) {
    pushRecord();
  }

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).filter((r) => {
    // Drop fully-empty rows (e.g. blank separator lines).
    return r.some((cell) => cell.trim().length > 0);
  });

  return { headers, rows };
}
