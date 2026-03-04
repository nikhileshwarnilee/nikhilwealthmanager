import { useEffect, useMemo, useState } from 'react';
import BottomSheet from './BottomSheet';
import {
  INTERVAL_HALF_OPTIONS,
  INTERVAL_MODE_OPTIONS,
  INTERVAL_MONTH_OPTIONS,
  INTERVAL_QUARTER_OPTIONS,
  intervalDisplayLabel,
  intervalStateKey,
  intervalYearOptions,
  normalizeIntervalState
} from '../utils/intervals';

export default function IntervalFilterSheet({
  open,
  onClose,
  value,
  onApply,
  title = 'Choose Interval',
  allowAllTime = true
}) {
  const [draft, setDraft] = useState(() => normalizeIntervalState(value));
  const valueKey = intervalStateKey(value);
  const modeOptions = useMemo(
    () =>
      allowAllTime
        ? INTERVAL_MODE_OPTIONS
        : INTERVAL_MODE_OPTIONS.filter((item) => item.value !== 'all_time'),
    [allowAllTime]
  );
  const yearOptions = useMemo(() => intervalYearOptions(new Date().getFullYear(), 12), []);

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeIntervalState(value));
  }, [open, valueKey, value]);

  const apply = () => {
    onApply?.(normalizeIntervalState(draft));
    onClose?.();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {modeOptions.map((option) => {
            const active = draft.mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className="flex w-full items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 text-left text-sm last:border-b-0 dark:border-slate-700 dark:bg-slate-900"
                onClick={() => setDraft((prev) => ({ ...prev, mode: option.value }))}
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                    active ? 'border-primary' : 'border-slate-400 dark:border-slate-500'
                  }`}
                >
                  {active ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{option.label}</span>
              </button>
            );
          })}
        </div>

        {draft.mode !== 'all_time' ? (
          <div className="grid grid-cols-1 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Year
              </span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={String(draft.year)}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    year: Number(event.target.value)
                  }))
                }
              >
                {yearOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {draft.mode === 'monthly' ? (
              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Month
                </span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={String(draft.month)}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      month: Number(event.target.value)
                    }))
                  }
                >
                  {INTERVAL_MONTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {draft.mode === 'quarterly' ? (
              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Quarter
                </span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={String(draft.quarter)}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      quarter: Number(event.target.value)
                    }))
                  }
                >
                  {INTERVAL_QUARTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {draft.mode === 'half_yearly' ? (
              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Half
                </span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={String(draft.half)}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      half: Number(event.target.value)
                    }))
                  }
                >
                  {INTERVAL_HALF_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Selected: <span className="font-semibold text-slate-700 dark:text-slate-200">{intervalDisplayLabel(draft)}</span>
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
            onClick={apply}
          >
            Apply
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
