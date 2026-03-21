import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon from '../../components/Icon';
import TransactionItem from '../../components/TransactionItem';
import { useAuth } from '../../app/AuthContext';
import { useToast } from '../../app/ToastContext';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { usePaginatedTransactions } from '../../hooks/usePaginatedTransactions';
import { fetchAccounts } from '../../services/accountService';
import { normalizeApiError } from '../../services/http';
import { currentMonthKey, isAllMonths, formatCurrency, monthDateRange, monthSelectorOptions } from '../../utils/format';
import { canEditTransaction } from '../../utils/permissions';

export default function AccountDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const accountId = String(id || '');
  const { user } = useAuth();
  const { pushToast } = useToast();

  const [month, setMonth] = useState(currentMonthKey());
  const [account, setAccount] = useState(null);
  const loadMoreRef = useRef(null);

  const monthOptions = useMemo(() => monthSelectorOptions(8, currentMonthKey()), []);

  const loadAccount = useCallback(async () => {
    try {
      const response = await fetchAccounts();
      const found = (response.accounts || []).find((item) => String(item.id) === accountId) || null;
      setAccount(found);
      if (!found) {
        pushToast({ type: 'warning', message: 'Account not found.' });
      }
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    }
  }, [accountId, pushToast]);

  const transactionQuery = useMemo(
    () => ({
      ...(monthDateRange(month) || {}),
      account_id: accountId
    }),
    [accountId, month]
  );

  const onTransactionError = useCallback(
    (error) => {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    },
    [pushToast]
  );

  const {
    transactions,
    totalCount: transactionCount,
    loading,
    loadingMore,
    hasMore,
    reload: loadTransactions,
    loadMore
  } = usePaginatedTransactions(transactionQuery, {
    pageSize: 100,
    onError: onTransactionError,
    enabled: Boolean(accountId)
  });

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);
  useInfiniteScroll(loadMoreRef, loadMore, hasMore && !loading && !loadingMore);

  const metrics = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const txn of transactions) {
      const amount = Number(txn.amount || 0);
      const fromId = String(txn.from_account_id || '');
      const toId = String(txn.to_account_id || '');

      if (txn.type === 'income' && toId === accountId) {
        inflow += amount;
      } else if (txn.type === 'expense' && fromId === accountId) {
        outflow += amount;
      } else if (txn.type === 'transfer') {
        if (fromId === accountId) outflow += amount;
        if (toId === accountId) inflow += amount;
      } else if (txn.type === 'opening_adjustment' && toId === accountId) {
        if (amount >= 0) inflow += amount;
        else outflow += Math.abs(amount);
      }
    }
    return { inflow, outflow };
  }, [accountId, transactions]);

  return (
    <AppShell
      title={account?.name || 'Account'}
      subtitle="Monthly account activity"
      onRefresh={loadTransactions}
      showFab={false}
      contentClassName="gap-2"
    >
      {account ? (
        <section className="card-surface rounded-xl p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name={account.type} size={16} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{account.type}</p>
                <h2 className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-100">{account.name}</h2>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                {formatCurrency(account.current_balance)}
              </p>
              <Link to={`/accounts/${accountId}/edit`} className="text-[11px] font-semibold text-primary">
                Edit account
              </Link>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-100 px-2 py-1.5 dark:bg-slate-800">
              <p className="text-[10px] font-semibold uppercase text-success">Inflow</p>
              <p className="text-[11px] font-extrabold text-success">{formatCurrency(metrics.inflow)}</p>
            </div>
            <div className="rounded-lg bg-slate-100 px-2 py-1.5 dark:bg-slate-800">
              <p className="text-[10px] font-semibold uppercase text-danger">Outflow</p>
              <p className="text-[11px] font-extrabold text-danger">{formatCurrency(metrics.outflow)}</p>
            </div>
            <div className="rounded-lg bg-slate-100 px-2 py-1.5 dark:bg-slate-800">
              <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Count</p>
              <p className="text-[11px] font-extrabold text-slate-900 dark:text-slate-100">{transactionCount}</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="card-surface rounded-xl p-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Account not found.</p>
        </section>
      )}

      <section className="card-surface rounded-xl p-2">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Month</p>
        <HorizontalSelector items={monthOptions} selected={month} onSelect={setMonth} />
      </section>

      <section className="card-surface rounded-xl p-2">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">Transactions</h3>
          <Link
            to={`/transactions/history?month=${month}&account_id=${accountId}`}
            className="text-[11px] font-semibold text-primary"
          >
            Full history
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-16 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
            ))}
          </div>
        ) : transactions.length ? (
          <div className="space-y-2">
            {transactions.map((txn) => (
              <TransactionItem
                key={txn.id}
                txn={txn}
                onEdit={canEditTransaction(user, txn) ? () => navigate(`/transactions/${txn.id}/edit`) : undefined}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={`No transactions in ${isAllMonths(month) ? 'all months' : 'this month'}`}
            subtitle="Try another period from selector."
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
      </section>
    </AppShell>
  );
}
