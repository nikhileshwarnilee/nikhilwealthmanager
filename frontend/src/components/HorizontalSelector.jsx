import { memo } from 'react';
import Icon from './Icon';
import { hapticTap } from '../utils/haptics';

function HorizontalSelector({
  items,
  selected,
  onSelect,
  iconKey = null,
  labelKey = 'label',
  valueKey = 'value',
  wrap = false,
  className = ''
}) {
  const layoutClass = wrap ? 'flex-wrap overflow-visible' : '-mx-1 overflow-x-auto';

  return (
    <div data-no-page-swipe className={`scroll-hidden flex gap-2 px-1 ${layoutClass} ${className}`}>
      {items.map((item) => {
        const value = String(item[valueKey]);
        const isActive = String(selected) === value;
        return (
          <button
            type="button"
            key={value}
            className={`flex shrink-0 min-h-[52px] min-w-[88px] max-w-[148px] items-center justify-center gap-2 overflow-hidden rounded-2xl border px-3 py-2 text-sm font-semibold transition-all duration-200 ${
              isActive
                ? 'border-primary bg-primary/12 text-primary shadow-card'
                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
            onClick={() => {
              hapticTap();
              onSelect(value);
            }}
          >
            {iconKey ? <Icon name={iconKey(item)} size={18} /> : null}
            <span className="block max-w-full truncate whitespace-nowrap">{item[labelKey]}</span>
          </button>
        );
      })}
    </div>
  );
}

export default memo(HorizontalSelector);
