/**
 * app.js — Main application controller.
 * Coordinates color-service, holiday-service, log-repo; renders DOM; handles interactions.
 */

import { colorFor, cycleLabel, canDeriveCycle, COLORS, GRAY, NEUTRAL, readableForeground } from './color-service.js';
import { HolidayService } from './holiday-service.js';
import { LogRepo } from './log-repo.js';

// ─── Service Worker registration ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ─── Singleton service ───────────────────────────────────────────────────────
const svc = new HolidayService();

// Cycle context: bridges the color-service to holiday data and memoizes per-year
// offsets / full-year colored-workday totals (cleared when data is force-reloaded).
const cycleCtx = {
  _yearOffset:      new Map(),
  _fullYearColored: new Map(),
  isWorkday: (dateStr) => svc.isWorkday(dateStr),
  isLoaded:  (year)    => svc.isLoaded(year),
};

const ANCHOR_YEAR = 2026;

// ─── Application state ───────────────────────────────────────────────────────
const today     = new Date();
today.setHours(0, 0, 0, 0);

const state = {
  year:        today.getFullYear(),
  month:       today.getMonth(), // 0-indexed
  selectedDate: null,            // Date | null
};

// ─── DOM refs ────────────────────────────────────────────────────────────────
const navBar       = document.getElementById('nav-bar');
const monthLabel   = document.getElementById('month-label');
const calendarGrid = document.getElementById('calendar-grid');
const logPanel     = document.getElementById('log-panel');
const logTitle     = document.getElementById('log-title');
const logTextarea  = document.getElementById('log-textarea');
const logSaveBtn   = document.getElementById('log-save');
const logCloseBtn  = document.getElementById('log-close');
const legendEl     = document.getElementById('legend');
const statusBar    = document.getElementById('status-bar');
const updateBanner = document.getElementById('update-banner');
const deriveBanner = document.getElementById('derive-banner');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Date as "YYYY-MM-DD". */
function toDateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Format a Date as "M/D" (no zero-padding). */
function toShortLabel(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─── Navigation bar ───────────────────────────────────────────────────────────
function renderHeader() {
  navBar.innerHTML = '';

  const buttons = [
    { label: '◀年', action: () => { state.year--;  render(); } },
    { label: '◀月', action: () => {
      state.month--;
      if (state.month < 0) { state.month = 11; state.year--; }
      render();
    }},
    { label: '今天', action: () => {
      state.year  = today.getFullYear();
      state.month = today.getMonth();
      render();
    }},
    { label: '月▶', action: () => {
      state.month++;
      if (state.month > 11) { state.month = 0; state.year++; }
      render();
    }},
    { label: '年▶', action: () => { state.year++;  render(); } },
  ];

  for (const { label, action } of buttons) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', action);
    navBar.appendChild(btn);
  }

  monthLabel.textContent = `${state.year}年${state.month + 1}月`;
}

// ─── Calendar grid ────────────────────────────────────────────────────────────
const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

async function renderCalendar() {
  calendarGrid.innerHTML = '';

  // Load every year required to derive this year's cycle (anchor → visible year),
  // then preload adjacent years (fire-and-forget) for snappy navigation.
  const lo = Math.min(state.year, ANCHOR_YEAR);
  const hi = Math.max(state.year, ANCHOR_YEAR);
  await svc.ensureYears(lo, hi);
  svc.ensureYear(state.year - 1);
  svc.ensureYear(state.year + 1);

  // Undivable: some required year could not be loaded (offline/degraded). Render neutral
  // cells without cycle labels and offer a manual retry; never approximate the cycle.
  const derivable = canDeriveCycle(state.year, cycleCtx);
  deriveBanner.classList.toggle('hidden', derivable);

  // ── Column headers ──────────────────────────────────────────────────────
  for (let i = 0; i < 7; i++) {
    const header = document.createElement('div');
    header.className = 'day-header' + (i >= 5 ? ' weekend' : '');
    header.textContent = DAY_NAMES[i];
    calendarGrid.appendChild(header);
  }

  // ── Day cells ───────────────────────────────────────────────────────────
  const firstDay  = new Date(state.year, state.month, 1);
  // JS getDay(): 0=Sun … 6=Sat → map to col 0=Mon … 6=Sun
  const startCol  = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();

  let todayCell = null;

  // Leading empty cells
  for (let i = 0; i < startCol; i++) {
    const empty = document.createElement('div');
    empty.className = 'day-cell empty';
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date    = new Date(state.year, state.month, day);
    const dateStr = toDateStr(date);
    const isWD    = svc.isWorkday(dateStr);
    const bg      = derivable ? colorFor(date, isWD, cycleCtx) : NEUTRAL;
    const fg      = readableForeground(bg);

    const cell = document.createElement('div');
    cell.className = 'day-cell';
    cell.style.backgroundColor = bg;
    cell.style.color           = fg;
    cell.dataset.date          = dateStr;

    const isToday    = date.getTime() === today.getTime();
    const isSelected = state.selectedDate &&
                       date.getTime() === state.selectedDate.getTime();

    if (isToday)    { cell.classList.add('today');    todayCell = cell; }
    if (isSelected) { cell.classList.add('selected'); }

    // Date line
    const dateLabel = document.createElement('span');
    dateLabel.className   = 'cell-date';
    dateLabel.textContent = toShortLabel(date);
    cell.appendChild(dateLabel);

    // Cycle label (only on derivable months, workdays only)
    if (derivable && isWD) {
      const cycleEl = document.createElement('span');
      cycleEl.className   = 'cell-cycle';
      cycleEl.textContent = cycleLabel(date, cycleCtx);
      cell.appendChild(cycleEl);
    }

    cell.addEventListener('click', () => selectDate(date));
    calendarGrid.appendChild(cell);
  }

  // Scroll today into view after paint
  if (todayCell) {
    requestAnimationFrame(() => todayCell.scrollIntoView({ block: 'nearest' }));
  }

  renderStatus();
}

// ─── Date selection & log panel ───────────────────────────────────────────────

/** Save whatever is in the textarea for the currently selected date. */
function flushLog() {
  if (state.selectedDate) {
    LogRepo.save(toDateStr(state.selectedDate), logTextarea.value);
  }
}

function selectDate(date) {
  // Auto-save previous selection
  flushLog();

  state.selectedDate = date;

  // Update selected cell highlight
  document.querySelectorAll('.day-cell.selected').forEach(c => c.classList.remove('selected'));
  const cell = calendarGrid.querySelector(`[data-date="${toDateStr(date)}"]`);
  if (cell) cell.classList.add('selected');

  renderLogPanel(toDateStr(date));
}

function renderLogPanel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  logTitle.textContent = `${y}年${m}月${d}日 日志`;
  logTextarea.value    = LogRepo.load(dateStr);

  // Show panel with CSS slide-up animation
  logPanel.classList.remove('hidden');
  // Force reflow so the transition fires from translateY(100%)
  logPanel.getBoundingClientRect();
  logPanel.classList.add('visible');
  logTextarea.focus();
}

function closeLogPanel() {
  flushLog();
  logPanel.classList.remove('visible');
  // Hide after transition ends to avoid invisible overlap
  logPanel.addEventListener('transitionend', () => {
    if (!logPanel.classList.contains('visible')) {
      logPanel.classList.add('hidden');
    }
  }, { once: true });
  state.selectedDate = null;
  document.querySelectorAll('.day-cell.selected').forEach(c => c.classList.remove('selected'));
}

logSaveBtn.addEventListener('click', () => {
  flushLog();
  // Brief visual feedback
  logSaveBtn.textContent = '已保存 ✓';
  setTimeout(() => { logSaveBtn.textContent = '保存'; }, 1200);
});

logCloseBtn.addEventListener('click', closeLogPanel);

// Auto-save on blur
logTextarea.addEventListener('blur', flushLog);

// ─── Legend ───────────────────────────────────────────────────────────────────
function renderLegend() {
  legendEl.innerHTML = '';

  const items = [
    { color: COLORS[0], label: '蓝 (循环 M=1)' },
    { color: COLORS[1], label: '黄 (循环 M=2)' },
    { color: COLORS[2], label: '绿 (循环 M=3)' },
    { color: GRAY,      label: '灰 (非工作日)' },
  ];

  for (const { color, label } of items) {
    const item    = document.createElement('div');
    item.className = 'legend-item';

    const swatch  = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.backgroundColor = color;

    const text    = document.createElement('span');
    text.textContent = label;

    item.appendChild(swatch);
    item.appendChild(text);
    legendEl.appendChild(item);
  }
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function renderStatus() {
  const year = state.year;
  if (svc.isDegraded(year)) {
    statusBar.textContent = `⚠ ${year} 节假日数据获取失败，使用周末模式`;
    statusBar.style.color = '#c05000';
  } else if (svc.isLoaded(year)) {
    // Check if it came from localStorage or network (heuristic: always "已加载")
    const lsKey = `workcal_holiday_${year}`;
    const source = localStorage.getItem(lsKey) ? '缓存' : '在线';
    statusBar.textContent = `✓ ${year} 节假日数据已加载（${source}）`;
    statusBar.style.color = '#388e3c';
  } else {
    statusBar.textContent = `正在加载 ${year} 节假日数据…`;
    statusBar.style.color = '#888';
  }
}

// ─── Full render ──────────────────────────────────────────────────────────────
async function render() {
  renderHeader();
  renderLegend();
  await renderCalendar();
}

// ─── Version check ───────────────────────────────────────────────────────────
const VERSION_KEY = 'workcal_app_version';

async function checkVersion() {
  try {
    const resp = await fetch('./version.json?_=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) return;
    const { v } = await resp.json();
    const stored = localStorage.getItem(VERSION_KEY);
    // First visit: just store version, don't show banner
    if (stored !== null && stored !== v) {
      updateBanner.classList.remove('hidden');
    }
    localStorage.setItem(VERSION_KEY, v);
  } catch (_) {
    // Offline or fetch failed — silently ignore
  }
}

async function applyUpdate() {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  location.reload();
}

updateBanner.addEventListener('click', applyUpdate);

// ─── Derive banner (chain-download missing holiday years) ────────────────────
async function retryDerive() {
  const lo = Math.min(state.year, ANCHOR_YEAR);
  const hi = Math.max(state.year, ANCHOR_YEAR);
  // Force a fresh fetch of every still-missing year, then rebuild.
  cycleCtx._yearOffset.clear();
  cycleCtx._fullYearColored.clear();
  for (let y = lo; y <= hi; y++) {
    if (!svc.isLoaded(y)) svc.forget(y);
  }
  deriveBanner.classList.add('hidden');
  statusBar.textContent = `正在联网推演 ${lo}–${hi} 节假日数据…`;
  statusBar.style.color = '#888';
  await render();
}

deriveBanner.addEventListener('click', retryDerive);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
render();
checkVersion();
