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

/**
 * RFC 3339 -> deterministic UTC display label (R5); unknown/empty falls back to "-".
 *
 * The shell contract requires deterministic formatting: rendering in the
 * host's local time zone made identical inputs render differently on local
 * machines and CI runners. UTC keeps the label stable everywhere; the
 * trailing `Z` makes the zone explicit instead of implying local time.
 *
 * Malformed input is never echoed back raw (SecurityReview MINOR-5);
 * it renders as a neutral placeholder instead.
 */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "[invalid timestamp]";
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return (
    `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())} ` +
    `${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}:${pad(parsed.getUTCSeconds())}Z`
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
