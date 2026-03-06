import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import CollapsibleIntervalSection from '../../components/CollapsibleIntervalSection';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import TransactionItem from '../../components/TransactionItem';
import { useToast } from '../../app/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { usePaginatedTransactions } from '../../hooks/usePaginatedTransactions';
import { useRouteState } from '../../hooks/useRouteState';
import { deleteAccount, fetchAccountView } from '../../services/accountService';
import { normalizeApiError } from '../../services/http';
import { exportTransactionsToCsv } from '../../utils/csv';
import { formatCurrency } from '../../utils/format';
import {
  createDefaultIntervalState,
  intervalDateRange,
  intervalDisplayLabel,
  intervalSummaryParams,
  intervalToQueryParams,
  shiftIntervalState
} from '../../utils/intervals';

export default function AccountViewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const accountId = Number(id || 0);
  const { pushToast } = useToast();

  const [interval, setInterval] = useRouteState(`account-${accountId}-interval`, () =>
    createDefaultIntervalState()
  );
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [searchOpen, setSearchOpen] = useRouteState(`account-${accountId}-search-open`, false);
  const [searchTerm, setSearchTerm] = useRouteState(`account-${accountId}-search-term`, '');
  const [account, setAccount] = useState(null);
  const loadMoreRef = useRef(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const normalizedSearch = debouncedSearch.trim();
  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);

  const loadAccount = useCallback(async () => {
    if (!accountId) return;
    setLoadingAccount(true);
    try {
      const viewRes = await fetchAccountView(accountId, intervalSummaryParams(interval));
      setAccount(viewRes.account || null);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoadingAccount(false);
    }
  }, [accountId, interval, pushToast]);

  const transactionQuery = useMemo(
    () => ({
      ...(normalizedSearch ? {} : (intervalDateRange(interval) || {})),
      account_id: accountId,
      search: normalizedSearch
    }),
    [accountId, interval, normalizedSearch]
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
    enabled: Boolean(accountId)
  });

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);
  useInfiniteScroll(loadMoreRef, loadMore, hasMore && !loading && !loadingMore);

  const filteredTransactions = transactions;

  const historyHref = useMemo(() => {
    const query = new URLSearchParams(intervalToQueryParams(interval));
    query.set('account_id', String(accountId));
    return `/transactions/history?${query.toString()}`;
  }, [accountId, interval]);
  const onSwipePrevInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, -1));
  }, []);
  const onSwipeNextInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, 1));
  }, []);

  const closeDelete = () => {
    setConfirmDelete(false);
    setDeleting(false);
  };

  const submitDelete = async () => {
    if (!account) return;
    if (Math.abs(Number(account.current_balance || 0)) >= 0.01) {
      pushToast({
        type: 'warning',
        message: 'Only zero-balance accounts can be deleted. Settle or transfer remaining balance first.'
      });
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount(account.id);
      pushToast({ type: 'success', message: 'Account deleted.' });
      closeDelete();
      navigate('/accounts', { replace: true });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title={account?.name || 'Account'}
      subtitle={`Read-only account view - ${intervalLabel}`}
      onRefresh={async () => {
        await Promise.all([loadAccount(), reloadTransactions()]);
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
      {loadingAccount ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
          ))}
        </div>
      ) : account ? (
        <>
          <section className="card-surface rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={account.type} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{account.type}</p>
                  <h2 className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-100">{account.name}</h2>
                </div>
              </div>
              <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                {formatCurrency(account.current_balance)}
              </p>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Opening</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(account.opening_balance)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Transactions</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{account.transaction_count}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-success">Inflow ({intervalLabel})</p>
                <p className="mt-1 font-semibold text-success">{formatCurrency(account.monthly_inflow)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-danger">Outflow ({intervalLabel})</p>
                <p className="mt-1 font-semibold text-danger">{formatCurrency(account.monthly_outflow)}</p>
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
                onClick={() => navigate(`/accounts/${account.id}/edit`)}
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
                Transactions
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {debouncedSearch
                  ? `${filteredTransactions.length}/${monthlyCount} matching`
                  : `${filteredTransactions.length}/${monthlyCount} in ${intervalLabel}`}
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
            <Link
              to={historyHref}
              className="mt-2 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Open full history
            </Link>
          </section>
        </>
      ) : (
        <section className="card-surface rounded-xl p-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">Account not found.</p>
        </section>
      )}

      <BottomSheet open={confirmDelete} onClose={closeDelete} title="Delete Account">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Delete this account from Accounts?
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Current balance: {formatCurrency(Number(account?.current_balance || 0))}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Existing transactions will remain in Transactions history, but this account will be removed.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You can delete only when account balance is exactly zero.
          </p>
          {Math.abs(Number(account?.current_balance || 0)) >= 0.01 ? (
            <p className="rounded-lg bg-amber-50 px-2 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              This account cannot be deleted right now because balance is not zero.
            </p>
          ) : null}

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
              disabled={deleting || Math.abs(Number(account?.current_balance || 0)) >= 0.01}
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
