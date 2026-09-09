export interface ClockPort {
  now(): Date;
  /** RFC 3339 UTC timestamp. */
  nowIso(): string;
  epochMs(): number;
}
