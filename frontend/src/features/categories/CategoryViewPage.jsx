import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import CollapsibleIntervalSection from '../../components/CollapsibleIntervalSection';
import EmptyState from '../../components/EmptyState';
import Icon, { categoryIconKey } from '../../components/Icon';
import TransactionItem from '../../components/TransactionItem';
import { useToast } from '../../app/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { usePaginatedTransactions } from '../../hooks/usePaginatedTransactions';
import { useRouteState } from '../../hooks/useRouteState';
import { deleteCategory, fetchCategoryView } from '../../services/categoryService';
import { normalizeApiError } from '../../services/http';
import { exportTransactionsToCsv } from '../../utils/csv';
import { formatCurrency } from '../../utils/format';
import {
  createDefaultIntervalState,
  intervalDateRange,
  intervalDisplayLabel,
  intervalSummaryParams,
  shiftIntervalState
} from '../../utils/intervals';

function parseDeleteDetails(error) {
  return error?.response?.data?.data?.errors || null;
}

export default function CategoryViewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const categoryId = Number(id || 0);
  const { pushToast } = useToast();

  const [interval, setInterval] = useRouteState(`category-${categoryId}-interval`, () =>
    createDefaultIntervalState()
  );
  const [loadingCategory, setLoadingCategory] = useState(true);
  const [searchOpen, setSearchOpen] = useRouteState(`category-${categoryId}-search-open`, false);
  const [searchTerm, setSearchTerm] = useRouteState(`category-${categoryId}-search-term`, '');
  const [category, setCategory] = useState(null);
  const loadMoreRef = useRef(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [requiresReallocation, setRequiresReallocation] = useState(false);
  const [transactionsToMove, setTransactionsToMove] = useState(0);
  const [replacementOptions, setReplacementOptions] = useState([]);
  const [replacementCategoryId, setReplacementCategoryId] = useState('');

  const debouncedSearch = useDebounce(searchTerm, 300);
  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);
  const iconName = useMemo(() => (category ? categoryIconKey(category) : 'categories'), [category]);

  const loadCategory = useCallback(async () => {
    if (!categoryId) return;
    setLoadingCategory(true);
    try {
      const viewRes = await fetchCategoryView(categoryId, intervalSummaryParams(interval));
      setCategory(viewRes.category || null);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoadingCategory(false);
    }
  }, [categoryId, interval, pushToast]);

  const transactionQuery = useMemo(
    () => ({
      ...(intervalDateRange(interval) || {}),
      category_id: categoryId
    }),
    [categoryId, interval]
  );

  const onTransactionError = useCallback(
    (error) => {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    },
    [pushToast]
  );

  const {
    transactions,
    totalCount: monthlyCount,
    loading,
    loadingMore,
    hasMore,
    reload: reloadTransactions,
    loadMore
  } = usePaginatedTransactions(transactionQuery, {
    pageSize: 100,
    onError: onTransactionError,
    enabled: Boolean(categoryId)
  });

  useEffect(() => {
    loadCategory();
  }, [loadCategory]);
  useInfiniteScroll(loadMoreRef, loadMore, hasMore && !loading && !loadingMore);

  const filteredTransactions = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter((txn) =>
      [txn.note, txn.category_name, txn.from_account_name, txn.to_account_name, txn.from_asset_type_name, txn.to_asset_type_name, txn.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [debouncedSearch, transactions]);

  const closeDelete = () => {
    setConfirmDelete(false);
    setDeleting(false);
    setRequiresReallocation(false);
    setTransactionsToMove(0);
    setReplacementOptions([]);
    setReplacementCategoryId('');
  };

  const submitDelete = async () => {
    if (!category) return;
    setDeleting(true);
    try {
      const options =
        requiresReallocation && replacementCategoryId
          ? { replacement_category_id: Number(replacementCategoryId) }
          : {};
      await deleteCategory(category.id, options);
      pushToast({ type: 'success', message: 'Category deleted.' });
      closeDelete();
      navigate('/categories', { replace: true });
    } catch (error) {
      const details = parseDeleteDetails(error);
      if (error?.response?.status === 409 && details?.requires_reallocation) {
        setRequiresReallocation(true);
        setTransactionsToMove(Number(details.transaction_count || 0));
        setReplacementOptions(details.categories || []);
        const first = (details.categories || [])[0];
        setReplacementCategoryId(first ? String(first.id) : '');
        setDeleting(false);
        return;
      }
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      setDeleting(false);
    }
  };
  const onSwipePrevInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, -1));
  }, []);
  const onSwipeNextInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, 1));
  }, []);

  return (
    <AppShell
      title={category?.name || 'Category'}
      subtitle={`Read-only category view - ${intervalLabel}`}
      onRefresh={async () => {
        await Promise.all([loadCategory(), reloadTransactions()]);
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
      {loadingCategory ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
          ))}
        </div>
      ) : category ? (
        <>
          <section className="card-surface rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ backgroundColor: category.color || '#7c3aed' }}>
                  <Icon name={iconName} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{category.type}</p>
                  <h2 className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-100">{category.name}</h2>
                </div>
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatCurrency(category.total_amount || 0)}</p>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Transactions</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{category.total_transactions}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Linked Budget</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {category.linked_budget ? formatCurrency(category.linked_budget.amount) : '-'}
                </p>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                onClick={() => navigate(-1)}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
                onClick={() => navigate(`/categories/${category.id}/edit`)}
              >
                Edit
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

          <CollapsibleIntervalSection value={interval} onChange={setInterval} />

          <section className="card-surface rounded-xl p-2">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Linked Transactions
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {filteredTransactions.length}/{monthlyCount} in {intervalLabel}
              </span>
            </div>
            {loading ? (
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
                title={debouncedSearch ? 'No matching transactions' : 'No transactions for selected period'}
                subtitle={debouncedSearch ? 'Try a different search term.' : 'Try another period.'}
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
            {category.linked_budget?.id ? (
              <Link
                to={`/budgets/${category.linked_budget.id}`}
                className="mt-2 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                Open linked budget
              </Link>
            ) : null}
          </section>
        </>
      ) : (
        <section className="card-surface rounded-xl p-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">Category not found.</p>
        </section>
      )}

      <BottomSheet open={confirmDelete} onClose={closeDelete} title="Delete Category">
        <div className="space-y-3">
          {!requiresReallocation ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Delete this category? Existing transactions may require a replacement category.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                This category has {transactionsToMove} transaction(s). Select a replacement category.
              </p>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={replacementCategoryId}
                onChange={(event) => setReplacementCategoryId(event.target.value)}
              >
                <option value="">Select replacement</option>
                {replacementOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              onClick={closeDelete}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting || (requiresReallocation && !replacementCategoryId)}
              className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              onClick={submitDelete}
            >
              {deleting ? 'Processing...' : 'Delete'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </AppShell>
  );
}
