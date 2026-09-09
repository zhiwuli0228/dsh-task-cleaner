import type { ClockPort } from '../../ports/clock.js';

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return new Date().toISOString();
  }

  epochMs(): number {
    return Date.now();
  }
}
