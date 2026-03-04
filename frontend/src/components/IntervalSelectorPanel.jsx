import { useMemo } from 'react';
import HorizontalSelector from './HorizontalSelector';
import {
  INTERVAL_HALF_OPTIONS,
  INTERVAL_MODE_OPTIONS,
  INTERVAL_MONTH_OPTIONS,
  INTERVAL_QUARTER_OPTIONS,
  intervalYearOptions,
  normalizeIntervalState
} from '../utils/intervals';

const YEAR_LOOKBACK = 12;

function toSelectorItems(items) {
  return items.map((item) => ({
    value: String(item.value),
    label: item.label
  }));
}

export default function IntervalSelectorPanel({
  value,
  onChange,
  allowAllTime = true
}) {
  const interval = normalizeIntervalState(value);
  const modeOptions = useMemo(
    () =>
      (allowAllTime ? INTERVAL_MODE_OPTIONS : INTERVAL_MODE_OPTIONS.filter((item) => item.value !== 'all_time')).map(
        (item) => ({
          value: item.value,
          label: item.label
        })
      ),
    [allowAllTime]
  );
  const yearOptions = useMemo(() => {
    return intervalYearOptions(new Date().getFullYear(), YEAR_LOOKBACK).map((item) => ({
      value: String(item.value),
      label: item.label
    }));
  }, []);
  const monthOptions = useMemo(() => toSelectorItems(INTERVAL_MONTH_OPTIONS), []);
  const quarterOptions = useMemo(() => toSelectorItems(INTERVAL_QUARTER_OPTIONS), []);
  const halfOptions = useMemo(() => toSelectorItems(INTERVAL_HALF_OPTIONS), []);

  const setPartial = (partial) => {
    onChange?.(normalizeIntervalState({ ...interval, ...partial }));
  };

  return (
    <div className="space-y-2">
      <div>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Interval</p>
        <HorizontalSelector items={modeOptions} selected={interval.mode} onSelect={(mode) => setPartial({ mode })} />
      </div>

      {interval.mode !== 'all_time' ? (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Year</p>
          <HorizontalSelector
            items={yearOptions}
            selected={String(interval.year)}
            onSelect={(year) => setPartial({ year: Number(year) })}
          />
        </div>
      ) : null}

      {interval.mode === 'monthly' ? (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Month</p>
          <HorizontalSelector
            items={monthOptions}
            selected={String(interval.month)}
            onSelect={(month) => setPartial({ month: Number(month) })}
          />
        </div>
      ) : null}

      {interval.mode === 'quarterly' ? (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quarter</p>
          <HorizontalSelector
            items={quarterOptions}
            selected={String(interval.quarter)}
            onSelect={(quarter) => setPartial({ quarter: Number(quarter) })}
          />
        </div>
      ) : null}

      {interval.mode === 'half_yearly' ? (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Half</p>
          <HorizontalSelector
            items={halfOptions}
            selected={String(interval.half)}
            onSelect={(half) => setPartial({ half: Number(half) })}
          />
        </div>
      ) : null}
    </div>
  );
}
