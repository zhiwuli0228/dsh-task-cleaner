/**
 * Pure presentation formatters (R5). The rest of the shell calls these
 * helpers instead of inlining byte/time math.
 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unit = "";
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024) break;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${unit}`;
}

/** RFC 3339 -> local display label; unknown/empty falls back to "-". */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return (
    `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ` +
    `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
  );
}

/** Escapes a path/name for single-line terminal or HTML-ish display. */
export function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/[\u0000-\u001f\u007f]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Path label for list/table display: escaped, with a neutral middle elision. */
export function pathLabel(path: string, maxChars = 72): string {
  const escaped = escapeLabel(path);
  if (escaped.length <= maxChars) return escaped;
  const head = Math.max(1, Math.floor((maxChars - 3) / 2));
  return `${escaped.slice(0, head)}...${escaped.slice(-head)}`;
}
