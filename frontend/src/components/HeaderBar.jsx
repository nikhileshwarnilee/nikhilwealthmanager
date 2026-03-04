import { Link } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import Icon from './Icon';

export default function HeaderBar({
  title,
  subtitle,
  searchEnabled = false,
  searchOpen = false,
  searchValue = '',
  onToggleSearch = null,
  onSearchChange = null,
  searchPlaceholder = 'Search',
  onExport = null,
  filterEnabled = false,
  onFilter = null,
  filterActive = false
}) {
  const { user, logout } = useAuth();
  const profileInitial = String(user?.name || '').trim().charAt(0).toUpperCase();

  return (
    <header className="z-40 h-12 border-b border-slate-200/70 bg-white/90 px-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-full w-full max-w-app items-center justify-between gap-2">
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
          {subtitle ? <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-1.5">
          {searchEnabled ? (
            <div className="flex items-center gap-1">
              <div
                className={`overflow-hidden transition-all duration-200 ${
                  searchOpen ? 'w-40 opacity-100' : 'w-0 opacity-0'
                }`}
              >
                <input
                  type="search"
                  value={searchValue}
                  placeholder={searchPlaceholder}
                  className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  onChange={(event) => onSearchChange?.(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                onClick={() => onToggleSearch?.()}
                aria-label={searchOpen ? 'Close search' : 'Open search'}
              >
                <Icon name={searchOpen ? 'close' : 'search'} size={16} />
              </button>
            </div>
          ) : null}
          {onExport ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              onClick={onExport}
              aria-label="Export CSV"
              title="Export CSV"
            >
              <Icon name="download" size={16} />
            </button>
          ) : null}
          {filterEnabled ? (
            <button
              type="button"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                filterActive
                  ? 'bg-primary/15 text-primary'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
              onClick={onFilter}
              aria-label="Open filters"
              title="Filters"
            >
              <Icon name="calendar" size={16} />
            </button>
          ) : null}
          <Link
            to="/settings"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
            aria-label="Open settings"
            title="Settings"
          >
            {profileInitial || <Icon name="settings" size={16} />}
          </Link>
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-100"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
