export function formatCurrency(value, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function currentMonthKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

export const ALL_MONTHS_VALUE = 'all';
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isAllMonths(value) {
  return String(value || '').toLowerCase() === ALL_MONTHS_VALUE;
}

export function isMonthKey(value) {
  return MONTH_KEY_PATTERN.test(String(value || ''));
}

export function normalizeMonthSelection(value, fallback = currentMonthKey()) {
  if (isAllMonths(value)) return ALL_MONTHS_VALUE;
  if (isMonthKey(value)) return String(value);
  return fallback;
}

export function datetimeLocalNow() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function recentMonthOptions(count = 12, fromMonth = currentMonthKey()) {
  const [yearStr, monthStr] = String(fromMonth).split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return [];

  const base = new Date(year, month - 1, 1);
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    items.push({ value, label });
  }
  return items;
}

export function monthSelectorOptions(count = 12, fromMonth = currentMonthKey()) {
  return [{ value: ALL_MONTHS_VALUE, label: 'All' }, ...recentMonthOptions(count, fromMonth)];
}

export function monthDateRange(month) {
  if (isAllMonths(month) || !isMonthKey(month)) return null;
  const [year, monthPart] = String(month).split('-');
  const lastDay = new Date(Number(year), Number(monthPart), 0).getDate();
  return {
    date_from: `${month}-01`,
    date_to: `${month}-${String(lastDay).padStart(2, '0')}`
  };
}
