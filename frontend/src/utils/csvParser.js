/** Split one CSV line into fields; supports "quoted, commas" */
export function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  fields.push(current.trim());
  return fields.map((f) => f.replace(/^"|"$/g, ""));
}

/** Parse a raw Revolut CSV string into { headers, rows }. */
export function parseRevolutCsv(raw) {
  const text = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!text) throw new Error("File is empty.");

  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error("Need a header row and at least one data row.");

  const headers = splitCsvLine(lines[0]);
  if (headers.length === 0 || headers.every((h) => !h))
    throw new Error("Could not read column headers.");

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every((c) => c === "")) continue;
    while (cells.length < headers.length) cells.push("");
    if (cells.length > headers.length) cells.length = headers.length;
    rows.push(cells);
  }

  return { headers, rows };
}
