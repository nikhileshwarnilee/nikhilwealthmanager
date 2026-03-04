import { currentMonthKey } from './format';

const MIN_INTERVAL_YEAR = 2000;

export const INTERVAL_MODE_OPTIONS = Object.freeze([
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'all_time', label: 'All Time' }
]);

export const INTERVAL_MONTH_OPTIONS = Object.freeze([
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' }
]);

export const INTERVAL_QUARTER_OPTIONS = Object.freeze([
  { value: 1, label: 'Q1 (Jan-Mar)' },
  { value: 2, label: 'Q2 (Apr-Jun)' },
  { value: 3, label: 'Q3 (Jul-Sep)' },
  { value: 4, label: 'Q4 (Oct-Dec)' }
]);

export const INTERVAL_HALF_OPTIONS = Object.freeze([
  { value: 1, label: 'H1 (Jan-Jun)' },
  { value: 2, label: 'H2 (Jul-Dec)' }
]);

function toInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function positiveModulo(value, base) {
  return ((value % base) + base) % base;
}

function monthKeyToState(monthKey) {
  const raw = String(monthKey || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return null;
  const [year, month] = raw.split('-');
  return {
    mode: 'monthly',
    year: Number(year),
    month: Number(month),
    quarter: clamp(Math.ceil(Number(month) / 3), 1, 4),
    half: Number(month) <= 6 ? 1 : 2
  };
}

export function createDefaultIntervalState(now = new Date()) {
  const monthState = monthKeyToState(currentMonthKey());
  if (monthState) {
    return monthState;
  }

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return {
    mode: 'monthly',
    year,
    month,
    quarter: clamp(Math.ceil(month / 3), 1, 4),
    half: month <= 6 ? 1 : 2
  };
}

export function normalizeIntervalState(input, now = new Date()) {
  const fallback = createDefaultIntervalState(now);
  const raw = input && typeof input === 'object' ? input : {};
  const mode = INTERVAL_MODE_OPTIONS.some((item) => item.value === raw.mode)
    ? raw.mode
    : fallback.mode;
  const year = toInt(raw.year, fallback.year);
  const month = clamp(toInt(raw.month, fallback.month), 1, 12);
  const quarter = clamp(toInt(raw.quarter, fallback.quarter), 1, 4);
  const half = clamp(toInt(raw.half, fallback.half), 1, 2);

  return { mode, year, month, quarter, half };
}

export function intervalStateKey(state) {
  const normalized = normalizeIntervalState(state);
  return `${normalized.mode}:${normalized.year}:${normalized.month}:${normalized.quarter}:${normalized.half}`;
}

export function isIntervalStateEqual(left, right) {
  return intervalStateKey(left) === intervalStateKey(right);
}

export function intervalModeLabel(mode) {
  const found = INTERVAL_MODE_OPTIONS.find((item) => item.value === mode);
  return found ? found.label : 'Interval';
}

export function intervalDisplayLabel(state) {
  const normalized = normalizeIntervalState(state);
  if (normalized.mode === 'all_time') return 'All Time';
  if (normalized.mode === 'yearly') return `${normalized.year}`;
  if (normalized.mode === 'half_yearly') return `H${normalized.half} ${normalized.year}`;
  if (normalized.mode === 'quarterly') return `Q${normalized.quarter} ${normalized.year}`;
  const monthLabel = INTERVAL_MONTH_OPTIONS[normalized.month - 1]?.label || `M${normalized.month}`;
  return `${monthLabel} ${normalized.year}`;
}

export function intervalDateRange(state) {
  const normalized = normalizeIntervalState(state);
  if (normalized.mode === 'all_time') return null;

  let start;
  let end;

  if (normalized.mode === 'yearly') {
    start = new Date(normalized.year, 0, 1);
    end = new Date(normalized.year, 11, 31);
  } else if (normalized.mode === 'half_yearly') {
    const startMonth = normalized.half === 1 ? 0 : 6;
    start = new Date(normalized.year, startMonth, 1);
    end = new Date(normalized.year, startMonth + 6, 0);
  } else if (normalized.mode === 'quarterly') {
    const startMonth = (normalized.quarter - 1) * 3;
    start = new Date(normalized.year, startMonth, 1);
    end = new Date(normalized.year, startMonth + 3, 0);
  } else {
    start = new Date(normalized.year, normalized.month - 1, 1);
    end = new Date(normalized.year, normalized.month, 0);
  }

  return {
    date_from: asDateString(start),
    date_to: asDateString(end)
  };
}

export function intervalSummaryParams(state) {
  const range = intervalDateRange(state);
  if (!range) {
    return { month: 'all' };
  }
  return range;
}

export function intervalToQueryParams(state) {
  const normalized = normalizeIntervalState(state);
  const params = {
    interval: normalized.mode,
    year: String(normalized.year)
  };
  if (normalized.mode === 'monthly') params.month = String(normalized.month);
  if (normalized.mode === 'quarterly') params.quarter = String(normalized.quarter);
  if (normalized.mode === 'half_yearly') params.half = String(normalized.half);
  return params;
}

export function parseIntervalFromParams(params, now = new Date()) {
  const getter =
    params && typeof params.get === 'function'
      ? (key) => params.get(key)
      : (key) => params?.[key];

  const defaultState = createDefaultIntervalState(now);
  const mode = String(getter('interval') || '').trim().toLowerCase();

  if (mode) {
    return normalizeIntervalState({
      mode,
      year: getter('year'),
      month: getter('month'),
      quarter: getter('quarter'),
      half: getter('half')
    }, now);
  }

  const legacyMonth = String(getter('month') || '').trim().toLowerCase();
  if (legacyMonth === 'all') {
    return normalizeIntervalState({
      ...defaultState,
      mode: 'all_time'
    }, now);
  }

  const legacyState = monthKeyToState(legacyMonth);
  if (legacyState) {
    return normalizeIntervalState(legacyState, now);
  }

  return defaultState;
}

export function intervalYearOptions(currentYear = new Date().getFullYear(), yearsBack = 8) {
  const options = [];
  for (let year = currentYear; year >= currentYear - yearsBack; year -= 1) {
    options.push({ value: year, label: String(year) });
  }
  return options;
}

export function isIntervalFilterActive(state, now = new Date()) {
  return !isIntervalStateEqual(state, createDefaultIntervalState(now));
}

function currentModeMax(mode, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const quarter = clamp(Math.ceil(month / 3), 1, 4);
  const half = month <= 6 ? 1 : 2;
  return normalizeIntervalState({ mode, year, month, quarter, half }, now);
}

function modeMin(mode, now = new Date()) {
  return normalizeIntervalState(
    {
      mode,
      year: MIN_INTERVAL_YEAR,
      month: 1,
      quarter: 1,
      half: 1
    },
    now
  );
}

function compareIntervalForMode(mode, left, right) {
  const a = normalizeIntervalState(left);
  const b = normalizeIntervalState(right);
  if (mode === 'yearly') {
    return a.year - b.year;
  }
  if (mode === 'half_yearly') {
    if (a.year !== b.year) return a.year - b.year;
    return a.half - b.half;
  }
  if (mode === 'quarterly') {
    if (a.year !== b.year) return a.year - b.year;
    return a.quarter - b.quarter;
  }
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

function clampShiftedState(state, now = new Date()) {
  const normalized = normalizeIntervalState(state, now);
  if (normalized.mode === 'all_time') {
    return normalized;
  }

  const min = modeMin(normalized.mode, now);
  const max = currentModeMax(normalized.mode, now);
  if (compareIntervalForMode(normalized.mode, normalized, min) < 0) {
    return min;
  }
  if (compareIntervalForMode(normalized.mode, normalized, max) > 0) {
    return max;
  }
  return normalized;
}

export function shiftIntervalState(state, direction, now = new Date()) {
  const normalized = normalizeIntervalState(state, now);
  if (normalized.mode === 'all_time') return normalized;

  const step = direction >= 0 ? 1 : -1;
  const next = { ...normalized };

  if (normalized.mode === 'yearly') {
    next.year += step;
    next.month = 1;
    next.quarter = 1;
    next.half = 1;
    return clampShiftedState(next, now);
  }

  if (normalized.mode === 'half_yearly') {
    const index = normalized.year * 2 + (normalized.half - 1) + step;
    next.year = Math.floor(index / 2);
    next.half = positiveModulo(index, 2) + 1;
    next.quarter = next.half === 1 ? 1 : 3;
    next.month = next.half === 1 ? 1 : 7;
    return clampShiftedState(next, now);
  }

  if (normalized.mode === 'quarterly') {
    const index = normalized.year * 4 + (normalized.quarter - 1) + step;
    next.year = Math.floor(index / 4);
    next.quarter = positiveModulo(index, 4) + 1;
    next.month = (next.quarter - 1) * 3 + 1;
    next.half = next.quarter <= 2 ? 1 : 2;
    return clampShiftedState(next, now);
  }

  const index = normalized.year * 12 + (normalized.month - 1) + step;
  next.year = Math.floor(index / 12);
  next.month = positiveModulo(index, 12) + 1;
  next.quarter = clamp(Math.ceil(next.month / 3), 1, 4);
  next.half = next.month <= 6 ? 1 : 2;
  return clampShiftedState(next, now);
}

export function canShiftInterval(state, direction, now = new Date()) {
  const shifted = shiftIntervalState(state, direction, now);
  return !isIntervalStateEqual(shifted, state);
}
