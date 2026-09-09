import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  escapeLabel,
  formatBytes,
  formatTimestamp,
  pathLabel,
} from "../../src/shell/format.js";

describe("format helpers", () => {
  it("formats bytes with deterministic units", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1024), "1.00 KB");
    assert.equal(formatBytes(4 * 1024 * 1024), "4.00 MB");
    assert.equal(formatBytes(-1), "0 B");
  });

  it("formats RFC 3339 timestamps and keeps invalid values visible", () => {
    assert.match(formatTimestamp("2026-09-09T12:00:00.000Z"), /^2026-09-09 20:00:00$/);
    assert.equal(formatTimestamp(null), "-");
    assert.equal(formatTimestamp("not-a-date"), "not-a-date");
  });

  it("escapes control characters and path separators in labels", () => {
    assert.equal(escapeLabel("a\nb\tc\\d\u0000e"), "a\\nb\\tc\\\\d\\u0000e");
    // head(34) + ellipsis(3) + tail(34) for maxChars=72.
    assert.equal(pathLabel("x".repeat(100)).length, 71);
    assert.equal(pathLabel("short-path").length, 10);
  });
});
