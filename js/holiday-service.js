/**
 * holiday-service.js
 * Mirrors HolidayService + HolidayYear + HttpHolidayFetcher from the Java app.
 * Uses localStorage for caching instead of the filesystem.
 */

const PRIMARY_URL = year =>
  `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`;
const FALLBACK_URL = year =>
  `https://timor.tech/api/holiday/year/${year}/`;

const FETCH_TIMEOUT_MS = 5000;

/** localStorage key for one year's data. */
function lsKey(year) {
  return `workcal_holiday_${year}`;
}

/**
 * Serialize a HolidayYear-like object to JSON for localStorage.
 * Sets are stored as arrays.
 */
function serialize(data) {
  return JSON.stringify({
    offDays:    [...data.offDays],
    makeupDays: [...data.makeupDays],
  });
}

/** Deserialize from localStorage JSON back to { offDays: Set, makeupDays: Set }. */
function deserialize(json) {
  const raw = JSON.parse(json);
  return {
    offDays:    new Set(raw.offDays    ?? []),
    makeupDays: new Set(raw.makeupDays ?? []),
  };
}

/**
 * Parse holiday-cn format:
 * { "days": [ { "date": "2026-01-01", "isOffDay": true }, ... ] }
 */
function parseHolidayCn(json) {
  const root = JSON.parse(json);
  const offDays    = new Set();
  const makeupDays = new Set();
  for (const d of (root.days ?? [])) {
    if (d.isOffDay) {
      offDays.add(d.date);
    } else {
      makeupDays.add(d.date);
    }
  }
  return { offDays, makeupDays };
}

/**
 * Parse timor.tech format:
 * { "holiday": { "01-01": { "holiday": true, "date": "2026-01-01" }, ... } }
 */
function parseTimor(year, json) {
  const root = JSON.parse(json);
  const offDays    = new Set();
  const makeupDays = new Set();
  for (const [key, val] of Object.entries(root.holiday ?? {})) {
    const dateStr = val.date ?? `${year}-${key}`;
    if (val.holiday === true) {
      offDays.add(dateStr);
    } else {
      makeupDays.add(dateStr);
    }
  }
  return { offDays, makeupDays };
}

/** Fetch with AbortController timeout. */
async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  } finally {
    clearTimeout(id);
  }
}

/**
 * Attempt to retrieve holiday data from the network.
 * Tries primary source first; falls back to secondary on failure.
 */
async function fetchFromNetwork(year) {
  try {
    const text = await fetchWithTimeout(PRIMARY_URL(year), FETCH_TIMEOUT_MS);
    return parseHolidayCn(text);
  } catch (primaryErr) {
    console.warn(`[Holiday] primary source failed (${primaryErr.message}), trying fallback`);
    const text = await fetchWithTimeout(FALLBACK_URL(year), FETCH_TIMEOUT_MS);
    return parseTimor(year, text);
  }
}

/**
 * HolidayService class.
 *
 * Tier 1: in-memory cache (Map)
 * Tier 2: localStorage cache
 * Tier 3: network fetch (primary → fallback)
 * Tier 4: degraded mode (weekend-only rule)
 */
export class HolidayService {
  constructor() {
    /** @type {Map<number, {offDays: Set<string>, makeupDays: Set<string>}>} */
    this._memory   = new Map();
    /** @type {Set<number>} years that failed fetch and run in degraded mode */
    this._degraded = new Set();
  }

  /**
   * Ensure data for `year` is available.
   * Returns after data is loaded (from any tier).
   * Never throws — degrades gracefully on network failure.
   */
  async ensureYear(year) {
    // Tier 1: already in memory
    if (this._memory.has(year)) return;

    // Tier 2: localStorage
    const cached = localStorage.getItem(lsKey(year));
    if (cached) {
      try {
        this._memory.set(year, deserialize(cached));
        this._degraded.delete(year);
        return;
      } catch (e) {
        // corrupt cache — ignore and try network
        localStorage.removeItem(lsKey(year));
      }
    }

    // Tier 3: network
    try {
      const data = await fetchFromNetwork(year);
      this._memory.set(year, data);
      this._degraded.delete(year);
      // Persist to localStorage
      try {
        localStorage.setItem(lsKey(year), serialize(data));
      } catch (_) { /* quota exceeded — ignore */ }
    } catch (netErr) {
      console.error(`[Holiday] all sources failed for ${year}: ${netErr.message}`);
      // Tier 4: degraded — store empty sets so isWorkday falls back to weekend rule
      this._memory.set(year, { offDays: new Set(), makeupDays: new Set() });
      this._degraded.add(year);
    }
  }

  /**
   * Synchronous workday test.
   * dateStr format: "2026-07-07"
   * Falls back to weekend-only rule if data is not yet loaded.
   */
  isWorkday(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const data = this._memory.get(y);

    if (!data) {
      // Data not loaded yet — weekend rule
      const dow = date.getDay();
      return dow !== 0 && dow !== 6;
    }

    if (data.offDays.has(dateStr))    return false;
    const dow = date.getDay();
    return dow !== 0 && dow !== 6;
  }

  /**
   * True if the year is running in degraded (weekend-only) mode.
   */
  isDegraded(year) {
    return this._degraded.has(year);
  }

  /**
   * True if data for the year was successfully loaded (not degraded).
   */
  isLoaded(year) {
    return this._memory.has(year) && !this._degraded.has(year);
  }
}
