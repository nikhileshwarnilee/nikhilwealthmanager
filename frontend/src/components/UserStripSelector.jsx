import Icon from './Icon';

function initialsForUser(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'U';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

export default function UserStripSelector({
  users,
  selected,
  onSelect,
  emptyLabel = 'All users'
}) {
  const items = [
    { id: '', name: emptyLabel, initials: 'All', is_active: true, tone: 'muted' },
    ...(users || []).map((user) => ({
      id: String(user.id),
      name: user.name,
      initials: initialsForUser(user.name),
      is_active: user.is_active !== false,
      is_deleted: user.is_deleted === true,
      tone: 'user'
    }))
  ];

  return (
    <div className="overflow-x-auto pr-1 pb-1 scroll-hidden touch-pan-x">
      <div className="flex w-max gap-2">
        {items.map((item) => {
          const idValue = String(item.id);
          const active = String(selected || '') === idValue;
          return (
            <button
              key={idValue || 'all'}
              type="button"
              className={`w-[112px] shrink-0 rounded-xl border p-1.5 text-center transition-all duration-200 ${
                active
                  ? 'border-primary bg-primary/12 text-primary shadow-card'
                  : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
              onClick={() => onSelect(idValue)}
            >
              <span
                className={`mx-auto mb-1 inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                  item.tone === 'muted'
                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200'
                }`}
              >
                {item.tone === 'muted' ? <Icon name="people" size={14} /> : <span className="text-[10px] font-bold">{item.initials}</span>}
              </span>
              <p className="truncate text-[10px] font-semibold">{item.name}</p>
              {item.tone === 'user' && item.is_deleted ? (
                <p className="mt-0.5 truncate text-[9px] text-slate-400 dark:text-slate-500">Deleted</p>
              ) : item.tone === 'user' && !item.is_active ? (
                <p className="mt-0.5 truncate text-[9px] text-slate-400 dark:text-slate-500">Inactive</p>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
