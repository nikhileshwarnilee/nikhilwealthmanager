import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BusinessStripSelector from '../../components/BusinessStripSelector';
import CollapsibleIntervalSection from '../../components/CollapsibleIntervalSection';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon from '../../components/Icon';
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
import { fetchAccounts } from '../../services/accountService';
import { fetchBusinesses } from '../../services/businessService';
import { normalizeApiError } from '../../services/http';
import {
  buildTransactionReportDefinition,
  exportReportDefinition,
  fetchTransactionsForExport,
  formatReportDateRange,
  reportDateRangeFromInterval,
  validateReportDateRange
} from '../../utils/reportExport';
import {
  createDefaultIntervalState,
  intervalDateRange,
  intervalDisplayLabel,
  intervalToQueryParams,
  parseIntervalFromParams,
  shiftIntervalState
} from '../../utils/intervals';
import { isModuleEnabled } from '../../utils/modules';
import { shouldShowUserAttribution } from '../../utils/userAttribution';

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
  const { settings } = useAuth();
  const { pushToast } = useToast();
  const businessesEnabled = isModuleEnabled(settings, 'businesses');
  const assetsEnabled = isModuleEnabled(settings, 'assets');
  const showUserAttribution = shouldShowUserAttribution(settings);
  const [params, setParams] = useSearchParams();
  const [searchOpen, setSearchOpen] = useRouteState('history-search-open', false);
  const [search, setSearch] = useRouteState('history-search', '');
  const [interval, setInterval] = useRouteState('history-interval', () => {
    const parsed = parseIntervalFromParams(params);
    return parsed || createDefaultIntervalState();
  });
  const [type, setType] = useRouteState('history-type-filter', params.get('type') || '');
  const [accountId, setAccountId] = useRouteState('history-account-filter', params.get('account_id') || '');
  const [businessId, setBusinessId] = useRouteState('history-business-filter', params.get('business_id') || '');
  const [createdByUserId, setCreatedByUserId] = useRouteState('history-user-filter', params.get('created_by_user_id') || '');
  const [accounts, setAccounts] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [businessesLoaded, setBusinessesLoaded] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const paramsString = params.toString();
  const loadMoreRef = useRef(null);
  const initializedRef = useRef(false);
  const visibleTypeOptions = useMemo(
    () => (assetsEnabled ? typeOptions : typeOptions.filter((option) => option.value !== 'asset')),
    [assetsEnabled]
  );
  const allowedTypeValues = useMemo(() => new Set(visibleTypeOptions.map((option) => String(option.value))), [visibleTypeOptions]);
  const normalizedType = allowedTypeValues.has(String(type)) ? String(type) : '';
  const normalizedAccountId = useMemo(() => {
    const raw = String(accountId || '').trim();
    if (!raw) return '';
    if (!accountsLoaded) return raw;
    return accounts.some((account) => String(account.id) === raw) ? raw : '';
  }, [accountId, accounts, accountsLoaded]);
  const normalizedBusinessId = useMemo(() => {
    if (!businessesEnabled) return '';
    const raw = String(businessId || '').trim();
    if (!raw) return '';
    if (!businessesLoaded) return raw;
    return businesses.some((business) => String(business.id) === raw) ? raw : '';
  }, [businessId, businesses, businessesEnabled, businessesLoaded]);
  const { users: workspaceUsers, loading: workspaceUsersLoading } = useWorkspaceUsers(showUserAttribution);
  const normalizedCreatedByUserId = useMemo(() => {
    if (!showUserAttribution) return '';
    const raw = String(createdByUserId || '').trim();
    if (!raw) return '';
    if (workspaceUsersLoading) return raw;
    return workspaceUsers.some((workspaceUser) => String(workspaceUser.id) === raw) ? raw : '';
  }, [createdByUserId, showUserAttribution, workspaceUsers, workspaceUsersLoading]);

  const debouncedSearch = useDebounce(search, 350);
  const normalizedSearch = debouncedSearch.trim();
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
  const loadBusinesses = useCallback(async () => {
    if (!businessesEnabled) {
      setBusinesses([]);
      setBusinessesLoaded(true);
      return;
    }
    setBusinessesLoaded(false);
    try {
      const response = await fetchBusinesses();
      setBusinesses(response.businesses || []);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setBusinessesLoaded(true);
    }
  }, [businessesEnabled, pushToast]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (navigationType === 'POP') return;

    setInterval(parseIntervalFromParams(params) || createDefaultIntervalState());
    setType(String(params.get('type') || '').trim());
    setAccountId(String(params.get('account_id') || '').trim());
    setBusinessId(String(params.get('business_id') || '').trim());
    setCreatedByUserId(String(params.get('created_by_user_id') || '').trim());
    setSearch('');
    setSearchOpen(false);
  }, [navigationType, params, setAccountId, setBusinessId, setCreatedByUserId, setInterval, setSearch, setSearchOpen, setType]);

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
  useEffect(() => {
    const raw = String(businessId || '').trim();
    if (businessesLoaded && raw && normalizedBusinessId === '') {
      setBusinessId('');
    }
  }, [businessId, businessesLoaded, normalizedBusinessId, setBusinessId]);
  useEffect(() => {
    if (!businessesEnabled && String(businessId || '').trim() !== '') {
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

  const transactionQuery = useMemo(
    () => ({
      ...(normalizedSearch ? {} : (intervalDateRange(interval) || {})),
      type: normalizedType,
      account_id: normalizedAccountId,
      business_id: businessesEnabled ? normalizedBusinessId : '',
      created_by_user_id: showUserAttribution ? normalizedCreatedByUserId : '',
      search: normalizedSearch
    }),
    [businessesEnabled, interval, normalizedAccountId, normalizedBusinessId, normalizedCreatedByUserId, normalizedSearch, normalizedType, showUserAttribution]
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
    loadBusinesses();
  }, [loadAccounts, loadBusinesses]);

  useEffect(() => {
    const next = new URLSearchParams();
    Object.entries(intervalToQueryParams(interval)).forEach(([key, value]) => {
      next.set(key, value);
    });
    if (normalizedType) next.set('type', normalizedType);
    if (normalizedAccountId) next.set('account_id', normalizedAccountId);
    if (businessesEnabled && normalizedBusinessId) next.set('business_id', normalizedBusinessId);
    if (showUserAttribution && normalizedCreatedByUserId) next.set('created_by_user_id', normalizedCreatedByUserId);
    if (next.toString() !== paramsString) {
      setParams(next, { replace: true });
    }
  }, [businessesEnabled, interval, normalizedAccountId, normalizedBusinessId, normalizedCreatedByUserId, normalizedType, paramsString, setParams, showUserAttribution]);
  useInfiniteScroll(loadMoreRef, loadMore, hasMore && !loading && !loadingMore);

  const filteredTransactions = transactions;
  const defaultExportRange = useMemo(() => reportDateRangeFromInterval(interval), [interval]);
  const selectedAccount = useMemo(
    () => accounts.find((account) => String(account.id) === normalizedAccountId) || null,
    [accounts, normalizedAccountId]
  );
  const selectedBusiness = useMemo(
    () => businesses.find((business) => String(business.id) === normalizedBusinessId) || null,
    [businesses, normalizedBusinessId]
  );
  const selectedWorkspaceUser = useMemo(
    () => workspaceUsers.find((workspaceUser) => String(workspaceUser.id) === normalizedCreatedByUserId) || null,
    [normalizedCreatedByUserId, workspaceUsers]
  );
  const onGenerateReport = useCallback(
    async ({ format, fromDate, toDate }) => {
      try {
        const range = validateReportDateRange({ fromDate, toDate });
        const reportTransactions = await fetchTransactionsForExport(
          {
            type: normalizedType,
            account_id: normalizedAccountId,
            business_id: businessesEnabled ? normalizedBusinessId : '',
            created_by_user_id: showUserAttribution ? normalizedCreatedByUserId : ''
          },
          range,
          normalizedSearch
        );

        const definition = buildTransactionReportDefinition({
          title: 'Full History Report',
          subtitle: 'Historical transaction report',
          fileName: 'full-history-report',
          dateRangeLabel: formatReportDateRange(range.fromDate, range.toDate),
          transactions: reportTransactions,
          includeBusiness: businessesEnabled,
          includeCreatedBy: showUserAttribution,
          meta: [
            { label: 'Interval', value: intervalLabel },
            { label: 'Type', value: normalizedType || 'All' },
            { label: 'Account', value: selectedAccount?.name || 'All accounts' },
            { label: 'Business', value: businessesEnabled ? (selectedBusiness?.name || 'All businesses') : 'Businesses module off' },
            { label: 'User', value: showUserAttribution ? (selectedWorkspaceUser?.name || 'All users') : 'Single-user workspace' },
            { label: 'Search', value: normalizedSearch || 'None' }
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
      intervalLabel,
      normalizedBusinessId,
      normalizedCreatedByUserId,
      normalizedSearch,
      normalizedType,
      normalizedAccountId,
      pushToast,
      selectedAccount?.name,
      selectedBusiness?.name,
      selectedWorkspaceUser?.name,
      showUserAttribution
    ]
  );
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
      searchPlaceholder="Search all transactions"
      onExport={() => setExportOpen(true)}
      intervalSwipeEnabled={interval.mode !== 'all_time'}
      onIntervalSwipePrev={onSwipePrevInterval}
      onIntervalSwipeNext={onSwipeNextInterval}
    >
      <section className="card-surface space-y-3 rounded-2xl p-3">
        <CollapsibleIntervalSection value={interval} onChange={setInterval} />

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</p>
          <HorizontalSelector
            items={visibleTypeOptions}
            selected={normalizedType}
            onSelect={setType}
            iconKey={(item) => item.icon}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Account</p>
          <AccountStripSelector items={accountOptions} selected={normalizedAccountId} onSelect={setAccountId} />
        </div>

        {businessesEnabled ? (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Business</p>
            <BusinessStripSelector
              businesses={businesses}
              selected={normalizedBusinessId}
              onSelect={setBusinessId}
              emptyLabel="All businesses"
            />
          </div>
        ) : null}

        {showUserAttribution ? (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">User</p>
            <UserStripSelector
              users={workspaceUsers}
              selected={normalizedCreatedByUserId}
              onSelect={setCreatedByUserId}
              emptyLabel="All users"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            onClick={() => {
              setType('');
              setAccountId('');
              setBusinessId('');
              setCreatedByUserId('');
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

      <ReportExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Full History Report"
        subtitle="Generate a historical PDF, Excel, or CSV report"
        defaultRange={defaultExportRange}
        onGenerate={onGenerateReport}
      />

    </AppShell>
  );
}
