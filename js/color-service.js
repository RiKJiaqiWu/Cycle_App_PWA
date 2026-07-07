/**
 * color-service.js
 * Translated from WorkdayColorService.java (CONTINUOUS strategy only).
 *
 * Java DayOfWeek.getValue(): 1=Mon … 7=Sun
 * JS  Date.getDay():         0=Sun, 1=Mon … 6=Sat
 */

export const COLORS = ['#3366ff', '#f5b800', '#66ff33']; // blue, yellow, green
export const GRAY   = '#7a7a7a';

/** Fixed anchor matching Java CYCLE_ANCHOR = LocalDate.of(2026, 6, 29) */
const ANCHOR = new Date(2026, 5, 29); // month is 0-indexed in JS

/**
 * Count Mon–Fri in the half-open interval [start, endExclusive).
 * Mirrors the Java countWeekdays() exactly.
 */
function countWeekdays(start, endExclusive) {
  const msPerDay = 86400000;
  const days = Math.round((endExclusive - start) / msPerDay);
  if (days <= 0) return 0;
  let count = Math.floor(days / 7) * 5;
  const remainder = days % 7;
  // Iterate through the remaining days, advancing dow from start's weekday.
  let dow = start.getDay(); // 0=Sun … 6=Sat
  for (let k = 0; k < remainder; k++) {
    if (dow !== 0 && dow !== 6) count++; // Mon–Fri
    dow = (dow + 1) % 7;
  }
  return count;
}

/**
 * Signed weekday count: positive if anchor < d, negative if anchor > d.
 * Mirrors Java signedWeekdays().
 */
function signedWeekdays(anchor, d) {
  const anchorTime = anchor.getTime();
  const dTime     = d.getTime();
  if (anchorTime < dTime) return  countWeekdays(anchor, d);
  if (anchorTime > dTime) return -countWeekdays(d, anchor);
  return 0;
}

/** JavaScript equivalent of Java Math.floorMod(a, b). */
function floorMod(a, b) {
  return ((a % b) + b) % b;
}

/**
 * Cycle index 0/1/2 for a given date (same formula as Java colorIndex).
 */
export function colorIndex(d) {
  const n   = signedWeekdays(ANCHOR, d);
  const pos = floorMod(n, 36);
  return Math.floor(pos / 12);
}

/**
 * "M-S-D" cycle label (same formula as Java cycleLabel).
 */
export function cycleLabel(d) {
  const n    = signedWeekdays(ANCHOR, d);
  const pos  = floorMod(n, 36);
  const M    = Math.floor(pos / 12) + 1;
  const posM = pos % 12;
  const S    = Math.floor(posM / 4) + 1;
  const D    = (posM % 4) + 1;
  return `${M}-${S}-${D}`;
}

/**
 * Returns the background color hex string for a day cell.
 * Non-workdays → GRAY.
 */
export function colorFor(d, isWorkday) {
  return isWorkday ? COLORS[colorIndex(d)] : GRAY;
}

/**
 * Compute a foreground color (black / white) that is readable against bgHex.
 * Uses the BT.601 luminance formula.
 */
export function readableForeground(bgHex) {
  const hex = bgHex.replace('#', '');
  const r   = parseInt(hex.substring(0, 2), 16);
  const g   = parseInt(hex.substring(2, 4), 16);
  const b   = parseInt(hex.substring(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? '#000000' : '#ffffff';
}
