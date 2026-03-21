import { API_BASE } from '../config/api';

const appBaseRaw = import.meta.env.BASE_URL || '/';
const appBase = appBaseRaw.endsWith('/') ? appBaseRaw.slice(0, -1) : appBaseRaw;
const API_BASE_URL = API_BASE || (appBase ? `${appBase}/api` : '/api');
const PUBLIC_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

function looksLikeCustomIcon(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return (
    /^https?:\/\//i.test(raw) ||
    /^data:image\//i.test(raw) ||
    /^blob:/i.test(raw) ||
    raw.startsWith('uploads/') ||
    raw.startsWith('/uploads/') ||
    raw.startsWith('backend/') ||
    raw.startsWith('/backend/')
  );
}

function toCustomIconUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw) || /^blob:/i.test(raw)) {
    return raw;
  }

  const normalized = raw.replace(/^\/+/, '').replace(/\\/g, '/');
  if (normalized.startsWith('backend/')) {
    return `${PUBLIC_BASE_URL}/${normalized}`;
  }
  if (normalized.startsWith('uploads/')) {
    return `${PUBLIC_BASE_URL}/backend/${normalized}`;
  }
  return `${PUBLIC_BASE_URL}/backend/${normalized}`;
}

const iconMap = {
  home: (
    <path
      d="M3 10.5 12 3l9 7.5v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  transactions: (
    <>
      <path d="M4 7h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 4l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 17H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m10 14-4 3 4 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  budgets: (
    <>
      <rect x="4" y="11" width="4" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="10" y="7" width="4" height="13" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="16" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  settings: (
    <path
      d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm8 3.8-.9-.3a7.8 7.8 0 0 0-.4-1l.5-.8a1 1 0 0 0-.1-1.2l-1.2-1.2a1 1 0 0 0-1.2-.1l-.8.5a7.8 7.8 0 0 0-1-.4l-.3-.9a1 1 0 0 0-1-.7h-1.7a1 1 0 0 0-1 .7l-.3.9a7.8 7.8 0 0 0-1 .4l-.8-.5a1 1 0 0 0-1.2.1L4.9 8.7a1 1 0 0 0-.1 1.2l.5.8a7.8 7.8 0 0 0-.4 1l-.9.3a1 1 0 0 0-.7 1v1.7a1 1 0 0 0 .7 1l.9.3c.1.3.2.7.4 1l-.5.8a1 1 0 0 0 .1 1.2l1.2 1.2a1 1 0 0 0 1.2.1l.8-.5c.3.1.7.2 1 .4l.3.9a1 1 0 0 0 1 .7h1.7a1 1 0 0 0 1-.7l.3-.9c.3-.1.7-.2 1-.4l.8.5a1 1 0 0 0 1.2-.1l1.2-1.2a1 1 0 0 0 .1-1.2l-.5-.8c.1-.3.2-.7.4-1l.9-.3a1 1 0 0 0 .7-1V13a1 1 0 0 0-.7-1Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  plus: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  income: (
    <path
      d="M5 15 9 11l3 3 7-7M15 7h4v4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  expense: (
    <path
      d="m5 9 4 4 3-3 7 7M15 17h4v-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  transfer: (
    <>
      <path d="M4 8h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m13 4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m11 12-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 18a4.5 4.5 0 0 1 9 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="17" cy="10" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14.5 18a3.5 3.5 0 0 1 5.5-2.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  cash: (
    <>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  bank: (
    <>
      <path d="M3 9 12 4l9 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9v9M9 9v9M15 9v9M19 9v9M3 18h18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  upi: (
    <>
      <path d="M7 5v9a5 5 0 0 0 10 0V5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 5h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="7" width="17" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 10h6v4h-6a2 2 0 1 1 0-4Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="12" r="0.9" fill="currentColor" />
    </>
  ),
  credit: (
    <>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5V7M16 3.5V7M4 9.5h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  note: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  ledger: (
    <>
      <path d="M6 4.5h10.5A2.5 2.5 0 0 1 19 7v12.5H8.5A2.5 2.5 0 0 0 6 22Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M6 4.5A2.5 2.5 0 0 0 3.5 7v12.5H15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 9H15M8.5 13h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7 15 4-4 3 2 5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  asset: (
    <>
      <path d="M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 19v-6l4-3 3 2 5-5v12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  gold: (
    <>
      <path d="M5 16h8l3 3H8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 10h8l2.5 2.5H11.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M5 8h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  silver: (
    <>
      <ellipse cx="12" cy="12" rx="7.5" ry="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.2 12.2c0 1.7 1.5 3 3.8 3s3.8-1.2 3.8-2.8c0-1.5-1.2-2.2-3.4-2.7-2-.5-2.8-.9-2.8-2.1 0-1.1 1.1-2 2.7-2 1.5 0 2.7.6 3.2 1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  stocks: (
    <>
      <path d="M4 20V4M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7 15 3-4 3 2 4-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 7h3v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  mutual: (
    <>
      <circle cx="8" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 18a4 4 0 0 1 5 0M13.5 18a4 4 0 0 1 5 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.5 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  realestate: (
    <>
      <path d="M3.5 10 12 4l8.5 6v10h-17z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 20v-6h6v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  deposit: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9h8M8 12h8M8 15h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  crypto: (
    <>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v10M9.5 9.5H13a2 2 0 1 1 0 4h-3M9.5 13.5H13.5a2 2 0 1 1 0 4H9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  vehicle: (
    <>
      <path d="M4 14h16l-1.2-4.2A2 2 0 0 0 16.9 8H7.1a2 2 0 0 0-1.9 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M6.5 14v3M17.5 14v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7.5" cy="17" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="17" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m18 6-12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m8 10 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  file: (
    <>
      <path d="M7 3h7l5 5v13H7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  filter: (
    <path
      d="M4 6h16l-6 7v5l-4 2v-7L4 6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  accounts: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="14" r="1.2" fill="currentColor" />
    </>
  ),
  categories: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  food: (
    <>
      <path d="M7 4v8M10 4v8M7 8h3M9 12v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15 4v16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15 4c2 0 3.5 1.5 3.5 3.5S17 11 15 11" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  transport: <path d="M5 14h14l-1.3-5.2A2 2 0 0 0 15.8 7H8.2a2 2 0 0 0-1.9 1.8ZM7 14v3M17 14v3M6.5 17a1.5 1.5 0 1 0 0 .01ZM17.5 17a1.5 1.5 0 1 0 0 .01Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  shopping: (
    <>
      <path d="M6 8h12l-1.2 10H7.2L6 8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 8a3 3 0 1 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  utilities: <path d="m13 3-7 10h5l-1 8 8-12h-5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  salary: (
    <>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 12h9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 9v6" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  freelance: (
    <>
      <rect x="4.5" y="7.5" width="15" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 7.5V6a3 3 0 0 1 6 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.3A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  ,
  edit: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m12.5 7.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 7V5h6v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  )
};

const ICON_ALIASES = {
  briefcase: 'freelance',
  utensils: 'food',
  car: 'transport',
  bolt: 'utilities',
  bag: 'shopping',
  investment: 'asset',
  investments: 'asset',
  assets: 'asset',
  mutualfund: 'mutual',
  mutual_funds: 'mutual',
  'mutual-funds': 'mutual',
  fixeddeposit: 'deposit',
  fixed_deposit: 'deposit',
  real_estate: 'realestate',
  'real-estate': 'realestate'
};

export const ICON_NAMES = Object.freeze(Object.keys(iconMap));

export function categoryIconKey(category) {
  const directRaw = String(category?.icon || category?.category_icon || '').trim();
  const direct = directRaw.toLowerCase();
  if (directRaw) {
    if (iconMap[direct]) return direct;
    if (ICON_ALIASES[direct]) return ICON_ALIASES[direct];
    if (looksLikeCustomIcon(directRaw)) return directRaw;
  }

  const raw = String(
    `${category?.icon || ''} ${category?.category_icon || ''} ${category?.name || ''} ${category?.category_name || ''}`
  ).toLowerCase();
  if (raw.includes('food')) return 'food';
  if (raw.includes('transport')) return 'transport';
  if (raw.includes('shop')) return 'shopping';
  if (raw.includes('util')) return 'utilities';
  if (raw.includes('salary')) return 'salary';
  if (raw.includes('free')) return 'freelance';
  if (raw.includes('health') || raw.includes('heart')) return 'heart';
  const type = String(category?.type || category?.category_type || '').toLowerCase();
  return type === 'income' ? 'income' : 'expense';
}

export function assetIconKey(asset) {
  const directRaw = String(asset?.icon || asset?.asset_icon || '').trim();
  const direct = directRaw.toLowerCase();
  if (directRaw) {
    if (iconMap[direct]) return direct;
    if (ICON_ALIASES[direct]) return ICON_ALIASES[direct];
    if (looksLikeCustomIcon(directRaw)) return directRaw;
  }

  const raw = String(`${asset?.name || ''} ${asset?.asset_name || ''}`).toLowerCase();
  if (raw.includes('gold')) return 'gold';
  if (raw.includes('silver')) return 'silver';
  if (raw.includes('stock') || raw.includes('equity') || raw.includes('share')) return 'stocks';
  if (raw.includes('mutual')) return 'mutual';
  if (raw.includes('real estate') || raw.includes('property')) return 'realestate';
  if (raw.includes('deposit') || raw.includes('fd')) return 'deposit';
  if (raw.includes('crypto') || raw.includes('bitcoin')) return 'crypto';
  if (raw.includes('vehicle') || raw.includes('car')) return 'vehicle';
  return 'asset';
}

export default function Icon({ name, size = 20, className = '' }) {
  const rawName = String(name || '').trim();
  const normalizedName = rawName.toLowerCase();
  const iconName = ICON_ALIASES[normalizedName] || normalizedName;
  if (looksLikeCustomIcon(rawName) && !iconMap[iconName]) {
    return (
      <img
        src={toCustomIconUrl(rawName)}
        alt=""
        width={size}
        height={size}
        className={`inline-block rounded-md object-cover ${className}`}
        loading="lazy"
      />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {iconMap[iconName] || iconMap.chart}
    </svg>
  );
}
