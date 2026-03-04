import { memo } from 'react';
import Icon, { categoryIconKey } from './Icon';
import { hapticTap } from '../utils/haptics';

function IconGridSelector({
  items,
  selected,
  onSelect,
  emptyText = 'No options available.'
}) {
  if (!items.length) {
    return <p className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-300">{emptyText}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {items.map((item) => {
        const id = String(item.id);
        const active = String(selected) === id;
        return (
          <button
            key={id}
            type="button"
            className={`rounded-2xl border p-2 text-center transition-all duration-200 ${
              active
                ? 'border-primary bg-primary/12 text-primary shadow-card'
                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
            onClick={() => {
              hapticTap();
              onSelect(id);
            }}
          >
            <span className="mx-auto mb-1 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <Icon name={categoryIconKey(item)} size={18} />
            </span>
            <p className="truncate text-[11px] font-semibold">{item.name}</p>
          </button>
        );
      })}
    </div>
  );
}

export default memo(IconGridSelector);
