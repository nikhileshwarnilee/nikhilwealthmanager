import Icon from './Icon';

export default function BusinessStripSelector({
  businesses,
  selected,
  onSelect,
  emptyLabel = 'No business'
}) {
  const items = [
    { id: '', name: emptyLabel, tone: 'muted' },
    ...(businesses || []).map((business) => ({
      id: String(business.id),
      name: business.name,
      tone: 'business'
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
              key={idValue || 'empty'}
              type="button"
              className={`w-[108px] shrink-0 rounded-xl border p-1.5 text-center transition-all duration-200 ${
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
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
                }`}
              >
                <Icon name="briefcase" size={14} />
              </span>
              <p className="truncate text-[10px] font-semibold">{item.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
