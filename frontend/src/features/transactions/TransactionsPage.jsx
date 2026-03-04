import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import CollapsibleIntervalSection from '../../components/CollapsibleIntervalSection';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon from '../../components/Icon';
import TransactionItem from '../../components/TransactionItem';
import { useToast } from '../../app/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { usePaginatedTransactions } from '../../hooks/usePaginatedTransactions';
import { useRouteState } from '../../hooks/useRouteState';
import { fetchAccounts } from '../../services/accountService';
import { normalizeApiError } from '../../services/http';
import { exportTransactionsToCsv } from '../../utils/csv';
import {
  createDefaultIntervalState,
  intervalDateRange,
  intervalDisplayLabel,
  intervalToQueryParams,
  shiftIntervalState
} from '../../utils/intervals';

const typeOptions = [
  { value: '', label: 'All', icon: 'transactions' },
  { value: 'expense', label: 'Expense', icon: 'expense' },
  { value: 'income', label: 'Income', icon: 'income' },
  { value: 'transfer', label: 'Transfer', icon: 'transfer' }
];

function accountTypeIcon(type) {
  if (type === 'all') return 'transactions';
  return ['cash', 'bank', 'upi', 'wallet', 'credit', 'people'].includes(type) ? type : 'wallet';
}

function AccountStripSelector({ items, selected, onSelect }) {
  return (
    <div className="overflow-x-auto pr-1 pb-1 scroll-hidden touch-pan-x">
      <div className="flex w-max gap-2">
        {items.map((item) => {
          const value = String(item.value);
          const active = String(selected) === value;
          return (
            <button
              key={value}
              type="button"
              className={`w-[92px] shrink-0 rounded-xl border p-1.5 text-center transition-all duration-200 ${
                active
                  ? 'border-primary bg-primary/12 text-primary shadow-card'
                  : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
              onClick={() => onSelect(value)}
            >
              <span className="mx-auto mb-1 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <Icon name={accountTypeIcon(item.type)} size={14} />
              </span>
              <p className="truncate text-[10px] font-semibold">{item.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [searchOpen, setSearchOpen] = useRouteState('transactions-search-open', false);
  const [searchTerm, setSearchTerm] = useRouteState('transactions-search-term', '');
  const [interval, setInterval] = useRouteState('transactions-interval', () => createDefaultIntervalState());
  const [type, setType] = useRouteState('transactions-type-filter', '');
  const [accountId, setAccountId] = useRouteState('transactions-account-filter', '');
  const [accounts, setAccounts] = useState([]);
  const loadMoreRef = useRef(null);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);
  const periodLabel = intervalLabel.toLowerCase();
  const accountOptions = useMemo(
    () => [
      { value: '', label: 'All', type: 'all' },
      ...accounts.map((account) => ({
        value: String(account.id),
        label: account.name,
        type: account.type
      }))
    ],
    [accounts]
  );

  const loadAccounts = useCallback(async () => {
    try {
      const response = await fetchAccounts();
      setAccounts(response.accounts || []);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    }
  }, [pushToast]);

  const transactionQuery = useMemo(
    () => ({
      ...(intervalDateRange(interval) || {}),
      type,
      account_id: accountId
    }),
    [accountId, interval, type]
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
    loading,
    loadingMore,
    hasMore,
    reload: loadTransactions,
    loadMore
  } = usePaginatedTransactions(transactionQuery, {
    pageSize: 100,
    onError: onTransactionError
  });

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useInfiniteScroll(loadMoreRef, loadMore, hasMore && !loading && !loadingMore);

  const filteredTransactions = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter((txn) =>
      [txn.note, txn.category_name, txn.from_account_name, txn.to_account_name, txn.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [debouncedSearch, transactions]);

  const historyHref = useMemo(() => {
    const query = new URLSearchParams(intervalToQueryParams(interval));
    return `/transactions/history?${query.toString()}`;
  }, [interval]);
  const onSwipePrevInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, -1));
  }, []);
  const onSwipeNextInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, 1));
  }, []);

  return (
    <AppShell
      title="Transactions"
      subtitle={`Interval: ${intervalLabel}`}
      onRefresh={loadTransactions}
      searchEnabled
      searchOpen={searchOpen}
      searchValue={searchTerm}
      onToggleSearch={() => setSearchOpen((prev) => !prev)}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search in loaded list"
      onExport={() => exportTransactionsToCsv(filteredTransactions)}
      intervalSwipeEnabled={interval.mode !== 'all_time'}
      onIntervalSwipePrev={onSwipePrevInterval}
      onIntervalSwipeNext={onSwipeNextInterval}
      contentClassName="gap-2"
    >
      <section className="card-surface space-y-2 rounded-xl p-2">
        <CollapsibleIntervalSection value={interval} onChange={setInterval} />

        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</p>
          <HorizontalSelector
            items={typeOptions}
            selected={type}
            onSelect={setType}
            iconKey={(item) => item.icon}
          />
        </div>

        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Account</p>
          <AccountStripSelector items={accountOptions} selected={accountId} onSelect={setAccountId} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/transactions/new"
            className="rounded-xl bg-primary px-3 py-2 text-center text-xs font-semibold text-white"
          >
            Add Transaction
          </Link>
          <Link
            to={historyHref}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Full History
          </Link>
        </div>
      </section>

      <section className="card-surface rounded-xl p-2">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Transactions
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {filteredTransactions.length}/{transactions.length} loaded ({totalCount} total)
          </p>
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
            title={debouncedSearch ? 'No matching transactions' : `No transactions for ${periodLabel}`}
            subtitle={debouncedSearch ? 'Try a different search term.' : 'Try another period or add transaction.'}
          />
        )}
        {loadingMore ? (
          <div className="mt-2 space-y-2">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={`more-${idx}`} className="h-16 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
            ))}
          </div>
        ) : null}
        {hasMore ? (
          <div ref={loadMoreRef} className="mt-1 h-4 w-full" aria-hidden="true" />
        ) : null}
        {!hasMore && transactions.length > 0 ? (
          <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">All transactions loaded</p>
        ) : null}
        {hasMore && !loadingMore ? (
          <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">Scroll for more</p>
        ) : null}
      </section>
    </AppShell>
  );
}
