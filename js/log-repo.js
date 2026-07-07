/**
 * log-repo.js
 * Thin localStorage wrapper for per-day text logs.
 * Mirrors DailyLogRepository.java (file → localStorage).
 */

const KEY_PREFIX = 'workcal_log_';

export const LogRepo = {
  /**
   * Load the log text for a date.
   * @param {string} dateStr "YYYY-MM-DD"
   * @returns {string} Stored text, or '' if none.
   */
  load(dateStr) {
    return localStorage.getItem(`${KEY_PREFIX}${dateStr}`) ?? '';
  },

  /**
   * Save (or delete) the log text for a date.
   * Blank/whitespace-only text removes the entry.
   * @param {string} dateStr "YYYY-MM-DD"
   * @param {string} text
   */
  save(dateStr, text) {
    if (text.trim()) {
      localStorage.setItem(`${KEY_PREFIX}${dateStr}`, text);
    } else {
      localStorage.removeItem(`${KEY_PREFIX}${dateStr}`);
    }
  },
};
