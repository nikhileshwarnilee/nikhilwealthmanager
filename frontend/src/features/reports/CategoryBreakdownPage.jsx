import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AppShell from '../../components/AppShell';
import BusinessStripSelector from '../../components/BusinessStripSelector';
import CollapsibleIntervalSection from '../../components/CollapsibleIntervalSection';
import EmptyState from '../../components/EmptyState';
import Icon, { categoryIconKey } from '../../components/Icon';
import ReportExportSheet from '../../components/ReportExportSheet';
import TransactionItem from '../../components/TransactionItem';
import UserStripSelector from '../../components/UserStripSelector';
import { useAuth } from '../../app/AuthContext';
import { useToast } from '../../app/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { usePaginatedTransactions } from '../../hooks/usePaginatedTransactions';
import { useRouteState } from '../../hooks/useRouteState';
import { useWorkspaceUsers } from '../../hooks/useWorkspaceUsers';
import { fetchBusinesses } from '../../services/businessService';
import { normalizeApiError } from '../../services/http';
import { fetchCategoryBreakdownReport } from '../../services/reportService';
import { formatCurrency, formatDate } from '../../utils/format';
import {
  buildReportDefinition,
  buildTransactionReportDefinition,
  exportReportDefinition,
  filterTransactionsBySearch,
  formatReportDateRange,
  reportDateRangeFromInterval,
  validateReportDateRange
} from '../../utils/reportExport';
import {
  createDefaultIntervalState,
  intervalDateRange,
  intervalDisplayLabel,
  intervalSummaryParams,
  intervalToQueryParams,
  parseIntervalFromParams,
  shiftIntervalState
} from '../../utils/intervals';
import { isModuleEnabled } from '../../utils/modules';
import { shouldShowUserAttribution } from '../../utils/userAttribution';

function toType(value) {
  return value === 'income' ? 'income' : 'expense';
}

export default function CategoryBreakdownPage() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { id } = useParams();
  const { settings } = useAuth();
  const { pushToast } = useToast();
  const businessesEnabled = isModuleEnabled(settings, 'businesses');
  const showUserAttribution = shouldShowUserAttribution(settings);
  const [searchParams, setSearchParams] = useSearchParams();

  const categoryId = Number(id || 0);
  const [interval, setInterval] = useRouteState(`breakdown-${categoryId}-interval`, () => {
    const parsed = parseIntervalFromParams(searchParams);
    return parsed || createDefaultIntervalState();
  });
  const [type, setType] = useRouteState(`breakdown-${categoryId}-type`, () =>
    toType(searchParams.get('type'))
  );
  const [businessId, setBusinessId] = useRouteState(
    `breakdown-${categoryId}-business-filter`,
    () => String(searchParams.get('business_id') || '').trim()
  );
  const [createdByUserId, setCreatedByUserId] = useRouteState(
    `breakdown-${categoryId}-user-filter`,
    () => String(searchParams.get('created_by_user_id') || '').trim()
  );

  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useRouteState(`breakdown-${categoryId}-search-open`, false);
  const [searchTerm, setSearchTerm] = useRouteState(`breakdown-${categoryId}-search-term`, '');
  const [report, setReport] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [exportOpen, setExportOpen] = useState(false);
  const paramsString = searchParams.toString();
  const loadMoreRef = useRef(null);
  const initializedRef = useRef(false);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const normalizedSearch = debouncedSearch.trim();
  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);
  const { users: workspaceUsers, loading: workspaceUsersLoading } = useWorkspaceUsers(showUserAttribution);
  const normalizedCreatedByUserId = useMemo(() => {
    if (!showUserAttribution) return '';
    const raw = String(createdByUserId || '').trim();
    if (!raw) return '';
    if (workspaceUsersLoading) return raw;
    return workspaceUsers.some((workspaceUser) => String(workspaceUser.id) === raw) ? raw : '';
  }, [createdByUserId, showUserAttribution, workspaceUsers, workspaceUsersLoading]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (navigationType === 'POP') return;

    setInterval(parseIntervalFromParams(searchParams) || createDefaultIntervalState());
    setType(toType(searchParams.get('type')));
    setBusinessId(String(searchParams.get('business_id') || '').trim());
    setCreatedByUserId(String(searchParams.get('created_by_user_id') || '').trim());
    setSearchTerm('');
    setSearchOpen(false);
  }, [navigationType, searchParams, setBusinessId, setCreatedByUserId, setInterval, setSearchOpen, setSearchTerm, setType]);

  useEffect(() => {
    const next = new URLSearchParams();
    Object.entries(intervalToQueryParams(interval)).forEach(([key, value]) => {
      next.set(key, value);
    });
    if (type !== 'expense') {
      next.set('type', type);
    }
    if (businessesEnabled && businessId) {
      next.set('business_id', businessId);
    }
    if (showUserAttribution && normalizedCreatedByUserId) {
      next.set('created_by_user_id', normalizedCreatedByUserId);
    }
    if (next.toString() !== paramsString) {
      setSearchParams(next, { replace: true });
    }
  }, [businessId, businessesEnabled, interval, normalizedCreatedByUserId, paramsString, setSearchParams, showUserAttribution, type]);

  const loadBusinesses = useCallback(async () => {
    if (!businessesEnabled) {
      setBusinesses([]);
      return;
    }
    try {
      const response = await fetchBusinesses();
      setBusinesses(response.businesses || []);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    }
  }, [businessesEnabled, pushToast]);

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
        type,
        business_id: businessesEnabled && businessId ? businessId : undefined,
        created_by_user_id: showUserAttribution && normalizedCreatedByUserId ? normalizedCreatedByUserId : undefined
      });
      setReport(response || null);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [businessId, businessesEnabled, categoryId, interval, normalizedCreatedByUserId, pushToast, showUserAttribution, type]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);
  useEffect(() => {
    if (!businessesEnabled && businessId) {
      setBusinessId('');
    }
  }, [businessId, businessesEnabled, setBusinessId]);
  useEffect(() => {
    const raw = String(createdByUserId || '').trim();
    if (showUserAttribution && !workspaceUsersLoading && raw && normalizedCreatedByUserId === '') {
      setCreatedByUserId('');
    }
  }, [createdByUserId, normalizedCreatedByUserId, setCreatedByUserId, showUserAttribution, workspaceUsersLoading]);
  useEffect(() => {
    if (!showUserAttribution && String(createdByUserId || '').trim() !== '') {
      setCreatedByUserId('');
    }
  }, [createdByUserId, setCreatedByUserId, showUserAttribution]);

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
      business_id: businessesEnabled ? businessId : '',
      created_by_user_id: showUserAttribution ? normalizedCreatedByUserId : '',
      search: normalizedSearch
    }),
    [businessId, businessesEnabled, categoryId, interval, normalizedCreatedByUserId, normalizedSearch, showUserAttribution, type]
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
  const defaultExportRange = useMemo(() => reportDateRangeFromInterval(interval), [interval]);
  const selectedBusiness = useMemo(
    () => businesses.find((item) => String(item.id) === String(businessId)) || null,
    [businessId, businesses]
  );
  const selectedWorkspaceUser = useMemo(
    () => workspaceUsers.find((workspaceUser) => String(workspaceUser.id) === String(normalizedCreatedByUserId)) || null,
    [normalizedCreatedByUserId, workspaceUsers]
  );

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
  const onGenerateReport = useCallback(
    async ({ format, fromDate, toDate }) => {
      try {
        const range = validateReportDateRange({ fromDate, toDate });
        const reportData = await fetchCategoryBreakdownReport({
          category_id: categoryId,
          date_from: range.fromDate,
          date_to: range.toDate,
          type,
          business_id: businessesEnabled && businessId ? businessId : undefined,
          created_by_user_id: showUserAttribution && normalizedCreatedByUserId ? normalizedCreatedByUserId : undefined
        });

        const transactionDefinition = buildTransactionReportDefinition({
          title: `${reportData?.category?.name || category?.name || 'Category'} Breakdown Report`,
          subtitle: 'Category transactions',
          fileName: `${reportData?.category?.name || category?.name || 'category'}-breakdown-report`,
          dateRangeLabel: formatReportDateRange(range.fromDate, range.toDate),
          transactions: filterTransactionsBySearch(reportData?.transactions || [], normalizedSearch),
          includeBusiness: businessesEnabled,
          includeCreatedBy: showUserAttribution,
          meta: [],
          sheetName: 'Transactions'
        });

        const definition = buildReportDefinition({
          title: `${reportData?.category?.name || category?.name || 'Category'} Breakdown Report`,
          subtitle: `${type === 'expense' ? 'Expense' : 'Income'} analysis with daily movement and transactions`,
          fileName: `${reportData?.category?.name || category?.name || 'category'}-breakdown-report`,
          dateRangeLabel: formatReportDateRange(range.fromDate, range.toDate),
          meta: [
            { label: 'Category', value: reportData?.category?.name || category?.name || '-' },
            { label: 'Type', value: type },
            {
              label: 'Business',
              value: businessesEnabled ? (selectedBusiness?.name || 'All businesses') : 'Businesses module off'
            },
            {
              label: 'User',
              value: showUserAttribution ? (selectedWorkspaceUser?.name || 'All users') : 'Single-user workspace'
            },
            { label: 'View Interval', value: intervalLabel },
            {
              label: 'Search Filter',
              value: normalizedSearch ? `${normalizedSearch} (applied to transaction table)` : 'None'
            }
          ],
          summary: [
            { label: 'Total Amount', value: formatCurrency(reportData?.total_amount || 0) },
            { label: 'Transactions', value: String(reportData?.stats?.transaction_count || 0) },
            { label: 'Average', value: formatCurrency(reportData?.stats?.avg_amount || 0) },
            {
              label: 'Biggest Transaction',
              value: formatCurrency(reportData?.stats?.biggest_transaction?.amount || 0)
            },
            {
              label: 'Busiest Day',
              value: reportData?.stats?.busiest_day?.date ? formatDate(reportData.stats.busiest_day.date) : '-'
            }
          ],
          tables: [
            {
              name: 'Daily Breakdown',
              columns: [
                { key: 'date', label: 'Date' },
                { key: 'amount', label: 'Amount' },
                { key: 'count', label: 'Transactions' }
              ],
              rows: (reportData?.daily_breakdown || []).map((item) => ({
                date: formatDate(item.date),
                amount: formatCurrency(item.amount || 0),
                count: String(item.count || 0)
              }))
            },
            ...transactionDefinition.tables
          ]
        });

        await exportReportDefinition(format, definition);
        pushToast({ type: 'success', message: `${format.toUpperCase()} report generated.` });
      } catch (error) {
        pushToast({ type: 'danger', message: error?.message || normalizeApiError(error) });
      }
    },
    [
      businessesEnabled,
      businessId,
      category?.name,
      categoryId,
      intervalLabel,
      normalizedCreatedByUserId,
      normalizedSearch,
      pushToast,
      selectedBusiness?.name,
      selectedWorkspaceUser?.name,
      showUserAttribution,
      type
    ]
  );

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
      onExport={() => setExportOpen(true)}
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
            {businessesEnabled ? (
              <div className="mt-2">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Business
                </p>
                <BusinessStripSelector
                  businesses={businesses}
                  selected={businessId}
                  onSelect={setBusinessId}
                  emptyLabel="All businesses"
                />
              </div>
            ) : null}
            {showUserAttribution ? (
              <div className="mt-2">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  User
                </p>
                <UserStripSelector
                  users={workspaceUsers}
                  selected={normalizedCreatedByUserId}
                  onSelect={setCreatedByUserId}
                  emptyLabel="All users"
                />
              </div>
            ) : null}
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

      <ReportExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={`${category?.name || 'Category'} Breakdown Report`}
        subtitle="Generate a PDF, Excel, or CSV category breakdown report"
        defaultRange={defaultExportRange}
        onGenerate={onGenerateReport}
      />
    </AppShell>
  );
}
