import { useMemo, useState } from 'react';
import Icon from './Icon';
import IntervalSelectorPanel from './IntervalSelectorPanel';
import { intervalDisplayLabel } from '../utils/intervals';

export default function CollapsibleIntervalSection({
  value,
  onChange,
  allowAllTime = true,
  defaultOpen = false
}) {
  const [open, setOpen] = useState(defaultOpen);
  const label = useMemo(() => intervalDisplayLabel(value), [value]);

  return (
    <section className="card-surface rounded-xl p-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left dark:border-slate-700 dark:bg-slate-900"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon name="calendar" size={14} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Select Interval
            </p>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{label}</p>
          </div>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {open ? 'Hide' : 'Open'}
        </span>
      </button>

      {open ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          <IntervalSelectorPanel value={value} onChange={onChange} allowAllTime={allowAllTime} />
        </div>
      ) : null}
    </section>
  );
}
