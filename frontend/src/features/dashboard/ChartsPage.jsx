import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import AppShell from '../../components/AppShell';
import BusinessStripSelector from '../../components/BusinessStripSelector';
import CollapsibleIntervalSection from '../../components/CollapsibleIntervalSection';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon, { categoryIconKey } from '../../components/Icon';
import ReportExportSheet from '../../components/ReportExportSheet';
import UserStripSelector from '../../components/UserStripSelector';
import { useAuth } from '../../app/AuthContext';
import { useToast } from '../../app/ToastContext';
import { useWorkspaceUsers } from '../../hooks/useWorkspaceUsers';
import { fetchBusinesses } from '../../services/businessService';
import { normalizeApiError } from '../../services/http';
import { analyticsOverview } from '../../services/insightService';
import { fetchCategorySummaryReport } from '../../services/reportService';
import { formatCurrency } from '../../utils/format';
import {
  buildReportDefinition,
  exportReportDefinition,
  formatReportDateRange,
  reportDateRangeFromInterval,
  validateReportDateRange
} from '../../utils/reportExport';
import {
  createDefaultIntervalState,
  intervalDisplayLabel,
  intervalSummaryParams,
  intervalToQueryParams,
  shiftIntervalState
} from '../../utils/intervals';
import { isModuleEnabled } from '../../utils/modules';
import { shouldShowUserAttribution } from '../../utils/userAttribution';

const AnalyticsCharts = lazy(() => import('./AnalyticsCharts'));
const summaryTypeOptions = [
  { value: 'expense', label: 'Expense', icon: 'expense' },
  { value: 'income', label: 'Income', icon: 'income' }
];
const piePalette = ['#7c3aed', '#0ea5e9', '#16a34a', '#f97316', '#dc2626', '#f59e0b', '#14b8a6', '#e11d48'];

export default function ChartsPage() {
  const navigate = useNavigate();
  const { settings } = useAuth();
  const { pushToast } = useToast();
  const businessesEnabled = isModuleEnabled(settings, 'businesses');
  const showUserAttribution = shouldShowUserAttribution(settings);
  const [interval, setInterval] = useState(() => createDefaultIntervalState());
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [summaryType, setSummaryType] = useState('expense');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [categorySummary, setCategorySummary] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [businessId, setBusinessId] = useState('');
  const [createdByUserId, setCreatedByUserId] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);
  const summaryParams = useMemo(() => intervalSummaryParams(interval), [interval]);
  const { users: workspaceUsers } = useWorkspaceUsers(showUserAttribution);
  const normalizedCreatedByUserId = useMemo(() => {
    if (!showUserAttribution) return '';
    const raw = String(createdByUserId || '').trim();
    if (!raw) return '';
    return workspaceUsers.some((workspaceUser) => String(workspaceUser.id) === raw) ? raw : '';
  }, [createdByUserId, showUserAttribution, workspaceUsers]);

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

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const response = await analyticsOverview({
        ...summaryParams,
        business_id: businessesEnabled && businessId ? businessId : undefined,
        created_by_user_id: showUserAttribution && normalizedCreatedByUserId ? normalizedCreatedByUserId : undefined
      });
      setAnalytics(response);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [businessId, businessesEnabled, normalizedCreatedByUserId, pushToast, showUserAttribution, summaryParams]);

  const loadCategorySummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const response = await fetchCategorySummaryReport({
        ...summaryParams,
        type: summaryType,
        business_id: businessesEnabled && businessId ? businessId : undefined,
        created_by_user_id: showUserAttribution && normalizedCreatedByUserId ? normalizedCreatedByUserId : undefined
      });
      setCategorySummary(response || null);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      setCategorySummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [businessId, businessesEnabled, normalizedCreatedByUserId, pushToast, showUserAttribution, summaryParams, summaryType]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadAnalytics(), loadCategorySummary()]);
  }, [loadAnalytics, loadCategorySummary]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    loadCategorySummary();
  }, [loadCategorySummary]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);
  useEffect(() => {
    if (!businessesEnabled && businessId) {
      setBusinessId('');
    }
  }, [businessId, businessesEnabled]);
  useEffect(() => {
    if (showUserAttribution && String(createdByUserId || '').trim() && normalizedCreatedByUserId === '') {
      setCreatedByUserId('');
    }
  }, [createdByUserId, normalizedCreatedByUserId, setCreatedByUserId, showUserAttribution]);
  useEffect(() => {
    if (!showUserAttribution && String(createdByUserId || '').trim() !== '') {
      setCreatedByUserId('');
    }
  }, [createdByUserId, setCreatedByUserId, showUserAttribution]);

  const categoryRows = useMemo(() => {
    const rows = categorySummary?.categories || [];
    return rows.map((row, index) => ({
      ...row,
      total_amount: Number(row.total_amount || 0),
      percentage: Number(row.percentage || 0),
      category_color: row.category_color || piePalette[index % piePalette.length]
    }));
  }, [categorySummary]);
  const selectedBusiness = useMemo(
    () => businesses.find((business) => String(business.id) === String(businessId)) || null,
    [businessId, businesses]
  );
  const selectedWorkspaceUser = useMemo(
    () => workspaceUsers.find((workspaceUser) => String(workspaceUser.id) === String(normalizedCreatedByUserId)) || null,
    [normalizedCreatedByUserId, workspaceUsers]
  );
  const defaultExportRange = useMemo(() => reportDateRangeFromInterval(interval), [interval]);

  const toBreakdownLink = useCallback(
    (categoryId) => {
      const query = new URLSearchParams(intervalToQueryParams(interval));
      if (summaryType !== 'expense') {
        query.set('type', summaryType);
      }
      if (businessesEnabled && businessId) {
        query.set('business_id', businessId);
      }
      if (showUserAttribution && normalizedCreatedByUserId) {
        query.set('created_by_user_id', normalizedCreatedByUserId);
      }
      return `/reports/category/${categoryId}?${query.toString()}`;
    },
    [businessId, businessesEnabled, interval, normalizedCreatedByUserId, showUserAttribution, summaryType]
  );
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
        const [summaryReport, analyticsReport] = await Promise.all([
          fetchCategorySummaryReport({
            date_from: range.fromDate,
            date_to: range.toDate,
            type: summaryType,
            business_id: businessesEnabled && businessId ? businessId : undefined,
            created_by_user_id: showUserAttribution && normalizedCreatedByUserId ? normalizedCreatedByUserId : undefined
          }),
          analyticsOverview({
            date_from: range.fromDate,
            date_to: range.toDate,
            business_id: businessesEnabled && businessId ? businessId : undefined,
            created_by_user_id: showUserAttribution && normalizedCreatedByUserId ? normalizedCreatedByUserId : undefined
          })
        ]);

        const monthlyRows = analyticsReport?.monthly_bar || [];
        const totalIncome = monthlyRows.reduce((sum, item) => sum + Number(item.income || 0), 0);
        const totalExpense = monthlyRows.reduce((sum, item) => sum + Number(item.expense || 0), 0);
        const tables = [
          {
            name: 'Category Split',
            columns: [
              { key: 'category_name', label: 'Category' },
              { key: 'transaction_count', label: 'Transactions' },
              { key: 'total_amount', label: 'Amount' },
              { key: 'percentage', label: 'Share' }
            ],
            rows: (summaryReport?.categories || []).map((row) => ({
              category_name: row.category_name || '-',
              transaction_count: String(row.transaction_count || 0),
              total_amount: formatCurrency(row.total_amount || 0),
              percentage: `${Number(row.percentage || 0)}%`
            }))
          },
          {
            name: 'Cashflow Trend',
            columns: [
              { key: 'label', label: 'Period' },
              { key: 'income', label: 'Income' },
              { key: 'expense', label: 'Expense' },
              { key: 'net', label: 'Net Cashflow' }
            ],
            rows: monthlyRows.map((row) => ({
              label: row.label || row.month || '-',
              income: formatCurrency(row.income || 0),
              expense: formatCurrency(row.expense || 0),
              net: formatCurrency(Number(row.income || 0) - Number(row.expense || 0))
            }))
          }
        ];

        if (summaryType === 'expense') {
          tables.push(
            {
              name: 'Top Spending Categories',
              columns: [
                { key: 'category_name', label: 'Category' },
                { key: 'total_spent', label: 'Amount' }
              ],
              rows: (analyticsReport?.top_spending_categories || []).map((row) => ({
                category_name: row.category_name || '-',
                total_spent: formatCurrency(row.total_spent || 0)
              }))
            },
            {
              name: 'Budget Snapshot',
              columns: [
                { key: 'total_budget', label: 'Budget' },
                { key: 'total_spent', label: 'Spent' },
                { key: 'total_remaining', label: 'Remaining' },
                { key: 'total_utilization_percent', label: 'Utilization' }
              ],
              rows: [
                {
                  total_budget: formatCurrency(analyticsReport?.budget_utilization?.total_budget || 0),
                  total_spent: formatCurrency(analyticsReport?.budget_utilization?.total_spent || 0),
                  total_remaining: formatCurrency(analyticsReport?.budget_utilization?.total_remaining || 0),
                  total_utilization_percent: `${Number(analyticsReport?.budget_utilization?.total_utilization_percent || 0)}%`
                }
              ]
            }
          );
        }

        const definition = buildReportDefinition({
          title: `${summaryType === 'expense' ? 'Expense' : 'Income'} Analysis Report`,
          subtitle: 'Category split, cashflow trend, and analysis summary',
          fileName: `${summaryType}-analysis-report`,
          dateRangeLabel: formatReportDateRange(range.fromDate, range.toDate),
          meta: [
            { label: 'Focus', value: summaryType },
            { label: 'View Interval', value: intervalLabel },
            {
              label: 'Business',
              value: businessesEnabled ? (selectedBusiness?.name || 'All businesses') : 'Businesses module off'
            },
            { label: 'User', value: showUserAttribution ? (selectedWorkspaceUser?.name || 'All users') : 'Single-user workspace' }
          ],
          summary: [
            {
              label: summaryType === 'expense' ? 'Total Expense' : 'Total Income',
              value: formatCurrency(summaryReport?.total_amount || 0)
            },
            { label: 'Transactions', value: String(summaryReport?.total_transactions || 0) },
            { label: 'Categories', value: String((summaryReport?.categories || []).length) },
            { label: 'Net Cashflow', value: formatCurrency(totalIncome - totalExpense) }
          ],
          tables
        });

        await exportReportDefinition(format, definition);
        pushToast({ type: 'success', message: `${format.toUpperCase()} report generated.` });
      } catch (error) {
        pushToast({ type: 'danger', message: error?.message || normalizeApiError(error) });
      }
    },
    [businessId, businessesEnabled, intervalLabel, normalizedCreatedByUserId, pushToast, selectedBusiness?.name, selectedWorkspaceUser?.name, showUserAttribution, summaryType]
  );

  return (
    <AppShell
      title="Charts"
      subtitle={`Visual analytics - ${intervalLabel}`}
      onRefresh={refreshAll}
      showFab={false}
      onExport={() => setExportOpen(true)}
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
        {businessesEnabled ? (
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Business</p>
            <BusinessStripSelector
              businesses={businesses}
              selected={businessId}
              onSelect={setBusinessId}
              emptyLabel="All businesses"
            />
          </div>
        ) : null}
        {showUserAttribution ? (
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">User</p>
            <UserStripSelector
              users={workspaceUsers}
              selected={normalizedCreatedByUserId}
              onSelect={setCreatedByUserId}
              emptyLabel="All users"
            />
          </div>
        ) : null}

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

      <ReportExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={`${summaryType === 'expense' ? 'Expense' : 'Income'} Analysis Report`}
        subtitle="Generate a PDF, Excel, or CSV analysis report"
        defaultRange={defaultExportRange}
        onGenerate={onGenerateReport}
      />
    </AppShell>
  );
}
