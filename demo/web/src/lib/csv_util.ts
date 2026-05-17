/** Shared CSV escaping for GLI demo exports. */

export function csvEscape(s: string): string {
  const t = s.replace(/"/g, '""');
  return /[",\n\r]/.test(t) ? `"${t}"` : t;
}

export function csvRow(cells: string[]): string {
  return cells.map((c) => csvEscape(c)).join(",");
}
