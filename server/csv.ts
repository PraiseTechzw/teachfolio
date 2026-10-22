/** Encode a CSV field and neutralize values that spreadsheet apps treat as formulas. */
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u0020\uFEFF]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
