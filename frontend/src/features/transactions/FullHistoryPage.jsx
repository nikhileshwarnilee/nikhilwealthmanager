import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
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
  parseIntervalFromParams,
  shiftIntervalState
} from '../../utils/intervals';

const typeOptions = [
  { value: '', label: 'All', icon: 'transactions' },
  { value: 'expense', label: 'Expense', icon: 'expense' },
  { value: 'income', label: 'Income', icon: 'income' },
  { value: 'transfer', label: 'Transfer', icon: 'transfer' },
  { value: 'asset', label: 'Asset', icon: 'asset' },
  { value: 'opening_adjustment', label: 'Adjust', icon: 'accounts' }
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

export default function FullHistoryPage() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { pushToast } = useToast();
  const [params, setParams] = useSearchParams();
  const [searchOpen, setSearchOpen] = useRouteState('history-search-open', false);
  const [search, setSearch] = useRouteState('history-search', '');
  const [interval, setInterval] = useRouteState('history-interval', () => {
    const parsed = parseIntervalFromParams(params);
    return parsed || createDefaultIntervalState();
  });
  const [type, setType] = useRouteState('history-type-filter', params.get('type') || '');
  const [accountId, setAccountId] = useRouteState('history-account-filter', params.get('account_id') || '');
  const [accounts, setAccounts] = useState([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const paramsString = params.toString();
  const loadMoreRef = useRef(null);
  const initializedRef = useRef(false);
  const allowedTypeValues = useMemo(() => new Set(typeOptions.map((option) => String(option.value))), []);
  const normalizedType = allowedTypeValues.has(String(type)) ? String(type) : '';
  const normalizedAccountId = useMemo(() => {
    const raw = String(accountId || '').trim();
    if (!raw) return '';
    if (!accountsLoaded) return raw;
    return accounts.some((account) => String(account.id) === raw) ? raw : '';
  }, [accountId, accounts, accountsLoaded]);

  const debouncedSearch = useDebounce(search, 350);
  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);

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
    setAccountsLoaded(false);
    try {
      const response = await fetchAccounts();
      setAccounts(response.accounts || []);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setAccountsLoaded(true);
    }
  }, [pushToast]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (navigationType === 'POP') return;

    setInterval(parseIntervalFromParams(params) || createDefaultIntervalState());
    setType(String(params.get('type') || '').trim());
    setAccountId(String(params.get('account_id') || '').trim());
    setSearch('');
    setSearchOpen(false);
  }, [navigationType, params, setAccountId, setInterval, setSearch, setSearchOpen, setType]);

  useEffect(() => {
    if (String(type) !== normalizedType) {
      setType(normalizedType);
    }
  }, [normalizedType, setType, type]);

  useEffect(() => {
    const raw = String(accountId || '').trim();
    if (accountsLoaded && raw && normalizedAccountId === '') {
      setAccountId('');
    }
  }, [accountId, accountsLoaded, normalizedAccountId, setAccountId]);

  const transactionQuery = useMemo(
    () => ({
      ...(intervalDateRange(interval) || {}),
      type: normalizedType,
      account_id: normalizedAccountId
    }),
    [interval, normalizedAccountId, normalizedType]
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
    reload: loadAll,
    loadMore
  } = usePaginatedTransactions(transactionQuery, {
    pageSize: 100,
    onError: onTransactionError
  });

  const refresh = useCallback(async () => {
    await loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const next = new URLSearchParams();
    Object.entries(intervalToQueryParams(interval)).forEach(([key, value]) => {
      next.set(key, value);
    });
    if (normalizedType) next.set('type', normalizedType);
    if (normalizedAccountId) next.set('account_id', normalizedAccountId);
    if (next.toString() !== paramsString) {
      setParams(next, { replace: true });
    }
  }, [interval, normalizedAccountId, normalizedType, paramsString, setParams]);
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

  const onExport = () => {
    exportTransactionsToCsv(filteredTransactions);
    pushToast({ type: 'success', message: 'CSV exported.' });
  };
  const onSwipePrevInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, -1));
  }, []);
  const onSwipeNextInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, 1));
  }, []);

  return (
    <AppShell
      title="Full History"
      subtitle={`Filters - ${intervalLabel}`}
      onRefresh={refresh}
      showFab={false}
      searchEnabled
      searchOpen={searchOpen}
      searchValue={search}
      onToggleSearch={() => setSearchOpen((prev) => !prev)}
      onSearchChange={setSearch}
      searchPlaceholder="Search loaded history"
      onExport={onExport}
      intervalSwipeEnabled={interval.mode !== 'all_time'}
      onIntervalSwipePrev={onSwipePrevInterval}
      onIntervalSwipeNext={onSwipeNextInterval}
    >
      <section className="card-surface space-y-3 rounded-2xl p-3">
        <CollapsibleIntervalSection value={interval} onChange={setInterval} />

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</p>
          <HorizontalSelector
            items={typeOptions}
            selected={normalizedType}
            onSelect={setType}
            iconKey={(item) => item.icon}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Account</p>
          <AccountStripSelector items={accountOptions} selected={normalizedAccountId} onSelect={setAccountId} />
        </div>

        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            onClick={() => {
              setType('');
              setAccountId('');
            }}
          >
            Clear Filters
          </button>
        </div>
      </section>

      <section className="mt-3 space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
          ))
        ) : filteredTransactions.length ? (
          <>
            {filteredTransactions.map((txn) => (
              <TransactionItem
                key={txn.id}
                txn={txn}
                onView={() => navigate(`/transactions/${txn.id}`)}
              />
            ))}

            <div className="card-surface rounded-2xl p-3 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {filteredTransactions.length} of {transactions.length} loaded ({totalCount} total)
              </p>
            </div>
          </>
        ) : (
          <EmptyState
            title="No history found"
            subtitle="Adjust filters or interval to view your transactions."
            action={
              <Link to="/transactions/new" className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white">
                Add Transaction
              </Link>
            }
          />
        )}
        {loadingMore ? (
          Array.from({ length: 2 }).map((_, idx) => (
            <div key={`more-${idx}`} className="h-20 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
          ))
        ) : null}
        {hasMore ? <div ref={loadMoreRef} className="h-4 w-full" aria-hidden="true" /> : null}
        {hasMore && !loadingMore ? (
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">Scroll for more</p>
        ) : null}
        {!hasMore && transactions.length > 0 ? (
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">All transactions loaded</p>
        ) : null}
      </section>

    </AppShell>
  );
}
