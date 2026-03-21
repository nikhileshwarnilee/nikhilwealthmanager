import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import EmptyState from '../../components/EmptyState';
import Icon, { categoryIconKey } from '../../components/Icon';
import ReportExportSheet from '../../components/ReportExportSheet';
import TransactionItem from '../../components/TransactionItem';
import { useAuth } from '../../app/AuthContext';
import { useToast } from '../../app/ToastContext';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { usePaginatedTransactions } from '../../hooks/usePaginatedTransactions';
import { deleteBudget, fetchBudgetView } from '../../services/budgetService';
import { normalizeApiError } from '../../services/http';
import { formatCurrency, monthDateRange } from '../../utils/format';
import {
  buildTransactionReportDefinition,
  exportReportDefinition,
  fetchTransactionsForExport,
  formatReportDateRange,
  reportDateRangeFromMonth,
  validateReportDateRange
} from '../../utils/reportExport';
import { isModuleEnabled } from '../../utils/modules';
import { shouldShowUserAttribution } from '../../utils/userAttribution';

export default function BudgetViewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const budgetId = Number(id || 0);
  const { settings } = useAuth();
  const { pushToast } = useToast();
  const businessesEnabled = isModuleEnabled(settings, 'businesses');
  const showUserAttribution = shouldShowUserAttribution(settings);

  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [budget, setBudget] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const loadMoreRef = useRef(null);

  const load = useCallback(async () => {
    if (!budgetId) return;
    setLoading(true);
    try {
      const response = await fetchBudgetView(budgetId);
      setBudget(response.budget || null);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [budgetId, pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  const transactionQuery = useMemo(() => {
    if (!budget?.month || !budget?.category?.id) return {};
    return {
      ...(monthDateRange(budget.month) || {}),
      category_id: budget.category.id,
      type: 'expense'
    };
  }, [budget]);

  const onTransactionError = useCallback(
    (error) => {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    },
    [pushToast]
  );

  const {
    transactions,
    totalCount,
    loading: loadingTransactions,
    loadingMore,
    hasMore,
    reload: reloadTransactions,
    loadMore
  } = usePaginatedTransactions(transactionQuery, {
    pageSize: 100,
    onError: onTransactionError,
    enabled: Boolean(budget?.month && budget?.category?.id)
  });

  useInfiniteScroll(loadMoreRef, loadMore, hasMore && !loadingTransactions && !loadingMore);

  const onDelete = async () => {
    if (!budget) return;
    setDeleting(true);
    try {
      await deleteBudget(budget.id);
      pushToast({ type: 'success', message: 'Budget deleted.' });
      navigate('/budgets', { replace: true });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setDeleting(false);
    }
  };

  const utilization = useMemo(() => Number(budget?.utilization_percentage || 0), [budget]);
  const defaultExportRange = useMemo(() => reportDateRangeFromMonth(budget?.month), [budget?.month]);
  const barColor =
    utilization > 100 ? 'bg-danger' : utilization >= 80 ? 'bg-warning' : utilization >= 50 ? 'bg-primary' : 'bg-success';
  const iconName = useMemo(() => {
    if (!budget?.category) return 'budgets';
    return categoryIconKey(budget.category);
  }, [budget]);
  const onGenerateReport = useCallback(
    async ({ format, fromDate, toDate }) => {
      try {
        const range = validateReportDateRange({ fromDate, toDate });
        const reportTransactions = await fetchTransactionsForExport(
          {
            category_id: budget?.category?.id,
            type: 'expense'
          },
          range
        );

        const definition = buildTransactionReportDefinition({
          title: `${budget?.category?.name || 'Budget'} Report`,
          subtitle: `Budget detail report${budget?.month ? ` for ${budget.month}` : ''}`,
          fileName: `${budget?.category?.name || `budget-${budgetId}`}-report`,
          dateRangeLabel: formatReportDateRange(range.fromDate, range.toDate),
          transactions: reportTransactions,
          includeBusiness: businessesEnabled,
          includeCreatedBy: showUserAttribution,
          meta: [
            { label: 'Budget Month', value: budget?.month || '-' },
            { label: 'Category', value: budget?.category?.name || '-' },
            { label: 'Budget Amount', value: formatCurrency(budget?.budget_amount || 0) },
            { label: 'Spent In Budget', value: formatCurrency(budget?.spent_amount || 0) },
            { label: 'Remaining', value: formatCurrency(budget?.remaining_amount || 0) },
            { label: 'Utilization', value: `${Number(budget?.utilization_percentage || 0)}%` }
          ],
          summary: [
            { label: 'Budget', value: formatCurrency(budget?.budget_amount || 0) },
            { label: 'Spent', value: formatCurrency(budget?.spent_amount || 0) },
            { label: 'Remaining', value: formatCurrency(budget?.remaining_amount || 0) },
            { label: 'Transactions', value: String(reportTransactions.length) }
          ],
          sheetName: 'Budget Transactions'
        });

        await exportReportDefinition(format, definition);
        pushToast({ type: 'success', message: `${format.toUpperCase()} report generated.` });
      } catch (error) {
        pushToast({ type: 'danger', message: error?.message || normalizeApiError(error) });
      }
    },
    [
      budget?.budget_amount,
      budget?.category?.id,
      budget?.category?.name,
      budget?.month,
      budget?.remaining_amount,
      budget?.spent_amount,
      budget?.utilization_percentage,
      budgetId,
      businessesEnabled,
      pushToast,
      showUserAttribution
    ]
  );

  return (
    <AppShell
      title="Budget"
      subtitle={budget?.month || 'Read-only budget view'}
      onRefresh={async () => {
        await Promise.all([load(), reloadTransactions()]);
      }}
      showFab={false}
      onExport={() => setExportOpen(true)}
      contentClassName="gap-2"
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
          ))}
        </div>
      ) : budget ? (
        <>
          <section className="card-surface rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={iconName} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{budget.month}</p>
                  <h2 className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-100">{budget.category?.name}</h2>
                </div>
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{budget.utilization_percentage}%</p>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Budget</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(budget.budget_amount)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Spent</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(budget.spent_amount)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Remaining</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(budget.remaining_amount)}</p>
              </div>
            </div>

            <div className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
              <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${Math.min(100, utilization)}%` }} />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                onClick={() => navigate('/budgets')}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-xl bg-danger px-3 py-2 text-xs font-semibold text-white"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            </div>
          </section>

          <section className="card-surface rounded-xl p-2">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Linked Transactions
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {transactions.length}/{totalCount} loaded
              </span>
            </div>

            {loadingTransactions ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="h-16 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
                ))}
              </div>
            ) : transactions.length ? (
              <div className="space-y-2">
                {transactions.map((txn) => (
                  <TransactionItem
                    key={txn.id}
                    txn={txn}
                    onView={() => navigate(`/transactions/${txn.id}`)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No linked transactions" subtitle="No expense transactions for this category/month." />
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
          </section>
        </>
      ) : (
        <section className="card-surface rounded-xl p-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">Budget not found.</p>
        </section>
      )}

      <ReportExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={`${budget?.category?.name || 'Budget'} Report`}
        subtitle="Generate a PDF, Excel, or CSV report for this budget"
        defaultRange={defaultExportRange}
        onGenerate={onGenerateReport}
      />

      <BottomSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete Budget">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Delete this budget entry for {budget?.month}?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              onClick={onDelete}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </AppShell>
  );
}
