/**
 * color-service.js
 * Translated from WorkdayColorService.java.
 *
 * Only "colored workdays" advance the cycle: a day advances when ctx.isWorkday(dateStr)
 * is true (neither a statutory holiday nor a weekend). The signed colored-workday count
 * N(d) is measured from the fixed ANCHOR (2026-06-29 == cycle 1-1-1). Whole-year totals
 * and per-year offsets are memoized on the caller-supplied `ctx` so only the target year
 * is scanned day-by-day.
 *
 * The `ctx` object must provide:
 *   - isWorkday(dateStr)  : boolean, dateStr "YYYY-MM-DD"
 *   - isLoaded(year)      : boolean, true when real (non-degraded) holiday data is present
 *   - _yearOffset         : Map<number, number>  (memoization, created by the caller)
 *   - _fullYearColored    : Map<number, number>  (memoization, created by the caller)
 */

export const COLORS  = ['#3366ff', '#f5b800', '#66ff33']; // blue, yellow, green
export const GRAY    = '#7a7a7a';
export const NEUTRAL = '#e0e0e0'; // undivable-year cell background

const ANCHOR_YEAR  = 2026;
const ANCHOR_MONTH = 6;  // 1-based
const ANCHOR_DAY   = 29;

/** JavaScript equivalent of Java Math.floorMod(a, b). */
function floorMod(a, b) {
  return ((a % b) + b) % b;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Format y (full), m (1-based), d as "YYYY-MM-DD". */
function toDateStr(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Count ctx.isWorkday-true days in the half-open interval [from, toExclusive).
 * `from` and `toExclusive` are Date objects at local midnight.
 */
function coloredWorkdaysBetween(ctx, from, toExclusive) {
  let count = 0;
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (cur < toExclusive) {
    const ds = toDateStr(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
    if (ctx.isWorkday(ds)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Colored workdays in the whole calendar year `y` (memoized on ctx). */
function fullYearColored(ctx, y) {
  if (ctx._fullYearColored.has(y)) return ctx._fullYearColored.get(y);
  const v = coloredWorkdaysBetween(ctx, new Date(y, 0, 1), new Date(y + 1, 0, 1));
  ctx._fullYearColored.set(y, v);
  return v;
}

/** N(Jan 1 of y): signed colored-workday offset from ANCHOR, chained out from 2026 (memoized). */
function yearOffset(ctx, y) {
  if (ctx._yearOffset.has(y)) return ctx._yearOffset.get(y);
  let result;
  if (y === ANCHOR_YEAR) {
    // N(anchor) == 0, so N(Jan 1) = -(colored workdays in [Jan 1, anchor)).
    result = -coloredWorkdaysBetween(
      ctx,
      new Date(ANCHOR_YEAR, 0, 1),
      new Date(ANCHOR_YEAR, ANCHOR_MONTH - 1, ANCHOR_DAY),
    );
  } else if (y > ANCHOR_YEAR) {
    result = yearOffset(ctx, y - 1) + fullYearColored(ctx, y - 1);
  } else {
    result = yearOffset(ctx, y + 1) - fullYearColored(ctx, y);
  }
  ctx._yearOffset.set(y, result);
  return result;
}

/**
 * Defensive guard mirroring Java WorkdayColorService.requireLoaded / CycleNotDerivableException:
 * refuse to derive a cycle when a required year is not loaded, so degraded/weekend-only data is
 * never used silently. app.js already gates rendering on canDeriveCycle(); this is a symmetric
 * backstop against future misuse. Only enforced when ctx exposes isLoaded() (the app's cycleCtx
 * always does), so it never changes the behavior of correctly-gated callers.
 */
function requireDerivable(year, ctx) {
  if (ctx && typeof ctx.isLoaded === 'function' && !canDeriveCycle(year, ctx)) {
    throw new Error('CycleNotDerivable: holiday data for year ' + year + ' is not loaded');
  }
}

/**
 * Signed colored-workday count N(d) from ANCHOR to d.
 * `d` is a Date at local midnight. Mirrors Java WorkdayColorService.signedColoredCount().
 * @throws {Error} 'CycleNotDerivable' if a required year is not loaded (see requireDerivable).
 */
export function signedColoredCount(d, ctx) {
  const year = d.getFullYear();
  requireDerivable(year, ctx);
  return yearOffset(ctx, year) + coloredWorkdaysBetween(ctx, new Date(year, 0, 1), d);
}

/**
 * True when every year between the anchor year (2026) and `year` (inclusive, either
 * direction) has real holiday data loaded, so the cycle can be derived without falling
 * back to degraded/weekend-only approximations.
 */
export function canDeriveCycle(year, ctx) {
  const lo = Math.min(year, ANCHOR_YEAR);
  const hi = Math.max(year, ANCHOR_YEAR);
  for (let y = lo; y <= hi; y++) {
    if (!ctx.isLoaded(y)) return false;
  }
  return true;
}

/** Cycle index 0/1/2 for a given date (same formula as Java colorIndex). */
export function colorIndex(d, ctx) {
  const pos = floorMod(signedColoredCount(d, ctx), 36);
  return Math.floor(pos / 12);
}

/** "M-S-D" cycle label (same formula as Java cycleLabel). */
export function cycleLabel(d, ctx) {
  const pos  = floorMod(signedColoredCount(d, ctx), 36);
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
export function colorFor(d, isWorkday, ctx) {
  return isWorkday ? COLORS[colorIndex(d, ctx)] : GRAY;
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
