import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AppShell from '../../components/AppShell';
import CollapsibleIntervalSection from '../../components/CollapsibleIntervalSection';
import EmptyState from '../../components/EmptyState';
import Icon, { categoryIconKey } from '../../components/Icon';
import TransactionItem from '../../components/TransactionItem';
import { useToast } from '../../app/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { usePaginatedTransactions } from '../../hooks/usePaginatedTransactions';
import { useRouteState } from '../../hooks/useRouteState';
import { normalizeApiError } from '../../services/http';
import { fetchCategoryBreakdownReport } from '../../services/reportService';
import { exportTransactionsToCsv } from '../../utils/csv';
import { formatCurrency, formatDate } from '../../utils/format';
import {
  createDefaultIntervalState,
  intervalDateRange,
  intervalDisplayLabel,
  intervalSummaryParams,
  intervalToQueryParams,
  parseIntervalFromParams,
  shiftIntervalState
} from '../../utils/intervals';

function toType(value) {
  return value === 'income' ? 'income' : 'expense';
}

export default function CategoryBreakdownPage() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { id } = useParams();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const categoryId = Number(id || 0);
  const [interval, setInterval] = useRouteState(`breakdown-${categoryId}-interval`, () => {
    const parsed = parseIntervalFromParams(searchParams);
    return parsed || createDefaultIntervalState();
  });
  const [type, setType] = useRouteState(`breakdown-${categoryId}-type`, () =>
    toType(searchParams.get('type'))
  );

  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useRouteState(`breakdown-${categoryId}-search-open`, false);
  const [searchTerm, setSearchTerm] = useRouteState(`breakdown-${categoryId}-search-term`, '');
  const [report, setReport] = useState(null);
  const paramsString = searchParams.toString();
  const loadMoreRef = useRef(null);
  const initializedRef = useRef(false);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const normalizedSearch = debouncedSearch.trim();
  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (navigationType === 'POP') return;

    setInterval(parseIntervalFromParams(searchParams) || createDefaultIntervalState());
    setType(toType(searchParams.get('type')));
    setSearchTerm('');
    setSearchOpen(false);
  }, [navigationType, searchParams, setInterval, setSearchOpen, setSearchTerm, setType]);

  useEffect(() => {
    const next = new URLSearchParams();
    Object.entries(intervalToQueryParams(interval)).forEach(([key, value]) => {
      next.set(key, value);
    });
    if (type !== 'expense') {
      next.set('type', type);
    }
    if (next.toString() !== paramsString) {
      setSearchParams(next, { replace: true });
    }
  }, [interval, paramsString, setSearchParams, type]);

  const load = useCallback(async () => {
    if (!categoryId) {
      setReport(null);
      return;
    }

    setLoading(true);
    try {
      const response = await fetchCategoryBreakdownReport({
        category_id: categoryId,
        ...intervalSummaryParams(interval),
        type
      });
      setReport(response || null);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [categoryId, interval, pushToast, type]);

  useEffect(() => {
    load();
  }, [load]);

  const dailyData = useMemo(
    () =>
      (report?.daily_breakdown || []).map((item) => ({
        ...item,
        amount: Number(item.amount || 0)
      })),
    [report]
  );

  const transactionQuery = useMemo(
    () => ({
      ...(normalizedSearch ? {} : (intervalDateRange(interval) || {})),
      category_id: categoryId,
      type,
      search: normalizedSearch
    }),
    [categoryId, interval, normalizedSearch, type]
  );

  const onTransactionError = useCallback(
    (error) => {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    },
    [pushToast]
  );

  const {
    transactions,
    totalCount,
    loading: listLoading,
    loadingMore,
    hasMore,
    reload: reloadTransactions,
    loadMore
  } = usePaginatedTransactions(transactionQuery, {
    pageSize: 100,
    onError: onTransactionError,
    enabled: Boolean(categoryId)
  });

  useInfiniteScroll(loadMoreRef, loadMore, hasMore && !listLoading && !loadingMore);

  const filteredTransactions = transactions;

  const category = report?.category || null;
  const stats = report?.stats || {};
  const barColor = type === 'expense' ? '#dc2626' : '#16a34a';
  const iconName = useMemo(() => (category ? categoryIconKey(category) : 'categories'), [category]);
  const onSwipePrevInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, -1));
  }, []);
  const onSwipeNextInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, 1));
  }, []);

  return (
    <AppShell
      title={category?.name || 'Category Breakdown'}
      subtitle={type === 'expense' ? intervalLabel : `Income - ${intervalLabel}`}
      onRefresh={async () => {
        await Promise.all([load(), reloadTransactions()]);
      }}
      showFab={false}
      searchEnabled
      searchOpen={searchOpen}
      searchValue={searchTerm}
      onToggleSearch={() => setSearchOpen((prev) => !prev)}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search transactions"
      onExport={() => exportTransactionsToCsv(filteredTransactions)}
      intervalSwipeEnabled={interval.mode !== 'all_time'}
      onIntervalSwipePrev={onSwipePrevInterval}
      onIntervalSwipeNext={onSwipeNextInterval}
      contentClassName="gap-2"
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
          ))}
        </div>
      ) : report && category ? (
        <>
          <section className="card-surface rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: category.color || '#7c3aed' }}
                >
                  <Icon name={iconName} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {category.type}
                  </p>
                  <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {category.name}
                  </h2>
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {formatCurrency(report.total_amount || 0)}
              </p>
            </div>
          </section>

          <section className="card-surface rounded-xl p-2">
            <CollapsibleIntervalSection value={interval} onChange={setInterval} />
          </section>

          <section className="card-surface rounded-xl p-2">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Daily {type === 'expense' ? 'spending' : 'income'}
            </h3>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    interval={Math.max(0, Math.floor((dailyData.length || 1) / 8))}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="amount" fill={barColor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div className="card-surface rounded-xl p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Avg {type === 'expense' ? 'Expense' : 'Income'}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(stats.avg_amount || 0)}
              </p>
            </div>
            <div className="card-surface rounded-xl p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Biggest Transaction
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(stats.biggest_transaction?.amount || 0)}
              </p>
            </div>
            <div className="card-surface rounded-xl p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Transactions Count
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {stats.transaction_count || 0}
              </p>
            </div>
            <div className="card-surface rounded-xl p-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Busiest Day
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {stats.busiest_day?.date ? formatDate(stats.busiest_day.date) : '-'}
              </p>
            </div>
          </section>

          <section className="card-surface rounded-xl p-2">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Transactions
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {filteredTransactions.length}/{transactions.length} loaded ({totalCount} total)
              </span>
            </div>

            {listLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="h-16 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
                ))}
              </div>
            ) : filteredTransactions.length ? (
              <div className="space-y-2">
                {filteredTransactions.map((txn) => (
                  <TransactionItem
                    key={txn.id}
                    txn={txn}
                    onView={() => navigate(`/transactions/${txn.id}`)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={debouncedSearch ? 'No matching transactions' : 'No transactions in this period'}
                subtitle={debouncedSearch ? 'Try another search term.' : 'Try a different period/type filter.'}
              />
            )}
            {loadingMore ? (
              <div className="mt-2 space-y-2">
                {Array.from({ length: 2 }).map((_, idx) => (
                  <div key={`more-${idx}`} className="h-16 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
                ))}
              </div>
            ) : null}
            {hasMore ? <div ref={loadMoreRef} className="mt-1 h-4 w-full" aria-hidden="true" /> : null}
            {hasMore && !loadingMore ? (
              <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">Scroll for more</p>
            ) : null}
            {!hasMore && transactions.length > 0 ? (
              <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">All transactions loaded</p>
            ) : null}
            <button
              type="button"
              className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              onClick={() => navigate('/charts')}
            >
              Back to charts
            </button>
          </section>
        </>
      ) : (
        <section className="card-surface rounded-xl p-3">
          <EmptyState title="Category report unavailable" subtitle="Check category filters or try again." />
          <button
            type="button"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            onClick={() => navigate('/charts')}
          >
            Back to charts
          </button>
        </section>
      )}
    </AppShell>
  );
}
