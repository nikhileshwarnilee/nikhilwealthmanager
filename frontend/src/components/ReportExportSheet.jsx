import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';

const formatOptions = [
  {
    value: 'pdf',
    label: 'PDF',
    description: 'Professional printable report.'
  },
  {
    value: 'excel',
    label: 'Excel',
    description: 'Spreadsheet with structured sheets.'
  },
  {
    value: 'csv',
    label: 'CSV',
    description: 'Simple flat export for quick sharing.'
  }
];

export default function ReportExportSheet({
  open,
  onClose,
  title = 'Export Report',
  subtitle = 'Choose format and date range',
  defaultRange = { fromDate: '', toDate: '' },
  defaultFormat = 'pdf',
  allowCsv = true,
  onGenerate
}) {
  const [format, setFormat] = useState(defaultFormat);
  const [fromDate, setFromDate] = useState(defaultRange?.fromDate || '');
  const [toDate, setToDate] = useState(defaultRange?.toDate || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormat(defaultFormat);
    setFromDate(defaultRange?.fromDate || '');
    setToDate(defaultRange?.toDate || '');
  }, [defaultFormat, defaultRange?.fromDate, defaultRange?.toDate, open]);

  const visibleFormats = allowCsv
    ? formatOptions
    : formatOptions.filter((item) => item.value !== 'csv');

  const submit = async () => {
    if (submitting || typeof onGenerate !== 'function') return;
    setSubmitting(true);
    try {
      await onGenerate({
        format,
        fromDate,
        toDate
      });
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{subtitle}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Choose a clean date window before generating the report.
          </p>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Format
          </p>
          <div className="grid gap-2">
            {visibleFormats.map((item) => {
              const active = format === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                  onClick={() => setFormat(item.value)}
                >
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-1 text-[11px] opacity-80">{item.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              From
            </span>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              To
            </span>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
        </div>

        <button
          type="button"
          disabled={submitting}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
          onClick={submit}
        >
          {submitting ? 'Generating...' : `Generate ${format.toUpperCase()} Report`}
        </button>
      </div>
    </BottomSheet>
  );
}
