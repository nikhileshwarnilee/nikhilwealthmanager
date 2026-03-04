import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import AppShell from '../../components/AppShell';
import CollapsibleIntervalSection from '../../components/CollapsibleIntervalSection';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon, { categoryIconKey } from '../../components/Icon';
import { useToast } from '../../app/ToastContext';
import { normalizeApiError } from '../../services/http';
import { analyticsOverview } from '../../services/insightService';
import { fetchCategorySummaryReport } from '../../services/reportService';
import { formatCurrency } from '../../utils/format';
import {
  createDefaultIntervalState,
  intervalDisplayLabel,
  intervalSummaryParams,
  intervalToQueryParams,
  shiftIntervalState
} from '../../utils/intervals';

const AnalyticsCharts = lazy(() => import('./AnalyticsCharts'));
const summaryTypeOptions = [
  { value: 'expense', label: 'Expense', icon: 'expense' },
  { value: 'income', label: 'Income', icon: 'income' }
];
const piePalette = ['#7c3aed', '#0ea5e9', '#16a34a', '#f97316', '#dc2626', '#f59e0b', '#14b8a6', '#e11d48'];

export default function ChartsPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [interval, setInterval] = useState(() => createDefaultIntervalState());
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [summaryType, setSummaryType] = useState('expense');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [categorySummary, setCategorySummary] = useState(null);
  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);
  const summaryParams = useMemo(() => intervalSummaryParams(interval), [interval]);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const response = await analyticsOverview(summaryParams);
      setAnalytics(response);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast, summaryParams]);

  const loadCategorySummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const response = await fetchCategorySummaryReport({
        ...summaryParams,
        type: summaryType
      });
      setCategorySummary(response || null);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      setCategorySummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [pushToast, summaryParams, summaryType]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadAnalytics(), loadCategorySummary()]);
  }, [loadAnalytics, loadCategorySummary]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    loadCategorySummary();
  }, [loadCategorySummary]);

  const categoryRows = useMemo(() => {
    const rows = categorySummary?.categories || [];
    return rows.map((row, index) => ({
      ...row,
      total_amount: Number(row.total_amount || 0),
      percentage: Number(row.percentage || 0),
      category_color: row.category_color || piePalette[index % piePalette.length]
    }));
  }, [categorySummary]);

  const toBreakdownLink = useCallback(
    (categoryId) => {
      const query = new URLSearchParams(intervalToQueryParams(interval));
      if (summaryType !== 'expense') {
        query.set('type', summaryType);
      }
      return `/reports/category/${categoryId}?${query.toString()}`;
    },
    [interval, summaryType]
  );
  const onSwipePrevInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, -1));
  }, []);
  const onSwipeNextInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, 1));
  }, []);

  return (
    <AppShell
      title="Charts"
      subtitle={`Visual analytics - ${intervalLabel}`}
      onRefresh={refreshAll}
      showFab={false}
      intervalSwipeEnabled={interval.mode !== 'all_time'}
      onIntervalSwipePrev={onSwipePrevInterval}
      onIntervalSwipeNext={onSwipeNextInterval}
    >
      <CollapsibleIntervalSection value={interval} onChange={setInterval} />

      <section className="card-surface mt-3 space-y-2 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Category Split</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">{summaryType}</span>
        </div>
        <HorizontalSelector
          items={summaryTypeOptions}
          selected={summaryType}
          onSelect={setSummaryType}
          iconKey={(item) => item.icon}
        />

        {summaryLoading ? (
          <div className="space-y-2">
            <div className="h-56 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
            <div className="h-24 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
          </div>
        ) : categoryRows.length ? (
          <>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryRows}
                    dataKey="total_amount"
                    nameKey="category_name"
                    innerRadius={44}
                    outerRadius={80}
                    onClick={(segment) => {
                      const categoryId = segment?.category_id || segment?.payload?.category_id;
                      if (!categoryId) return;
                      navigate(toBreakdownLink(categoryId));
                    }}
                  >
                    {categoryRows.map((entry) => (
                      <Cell key={entry.category_id} fill={entry.category_color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl bg-slate-100/70 p-2 text-xs dark:bg-slate-800/70">
              Total: <span className="font-semibold">{formatCurrency(categorySummary?.total_amount || 0)}</span>
            </div>

            <div className="space-y-1.5">
              {categoryRows.map((category) => (
                <button
                  key={category.category_id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-2 text-left transition-colors hover:border-primary/40 dark:border-slate-700 dark:bg-slate-900"
                  onClick={() =>
                    navigate(toBreakdownLink(category.category_id))
                  }
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: category.category_color }}
                    >
                      <Icon
                        name={categoryIconKey({
                          name: category.category_name,
                          icon: category.category_icon,
                          type: summaryType
                        })}
                        size={16}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {category.category_name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {category.transaction_count} transactions
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {formatCurrency(category.total_amount)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{category.percentage}%</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="No category data"
            subtitle={`No ${summaryType} transactions found for ${intervalLabel}.`}
          />
        )}
      </section>

      <section className="mt-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-64 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
            ))}
          </div>
        ) : analytics ? (
          <Suspense
            fallback={
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, idx) => (
                  <div key={idx} className="h-64 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
                ))}
              </div>
            }
          >
            <AnalyticsCharts
              monthlyBar={analytics.monthly_bar || []}
              pieData={analytics.category_pie || []}
              trendData={analytics.daily_trend_30d || []}
            />
          </Suspense>
        ) : (
          <EmptyState title="No analytics data" subtitle="Add transactions to unlock chart insights." />
        )}
      </section>

      <section className="mt-3">
        <Link
          to="/"
          className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          Back to dashboard
        </Link>
      </section>
    </AppShell>
  );
}
