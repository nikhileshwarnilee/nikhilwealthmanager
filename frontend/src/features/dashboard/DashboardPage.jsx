import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import EmptyState from '../../components/EmptyState';
import InstallPrompt from '../../components/InstallPrompt';
import IntervalFilterSheet from '../../components/IntervalFilterSheet';
import TransactionItem from '../../components/TransactionItem';
import { useToast } from '../../app/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useRouteState } from '../../hooks/useRouteState';
import { fetchAccounts } from '../../services/accountService';
import { fetchAssetSummary } from '../../services/assetService';
import { normalizeApiError } from '../../services/http';
import { monthlySummary } from '../../services/transactionService';
import { formatCurrency } from '../../utils/format';
import {
  createDefaultIntervalState,
  intervalDisplayLabel,
  intervalSummaryParams,
  isIntervalFilterActive
} from '../../utils/intervals';

const AccountTile = memo(function AccountTile({ account }) {
  return (
    <Link
      to={`/accounts/${account.id}`}
      className="card-surface block h-[62px] rounded-xl p-2 transition-transform duration-200 active:scale-[0.99]"
    >
      <p className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">{account.name}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
        {formatCurrency(account.current_balance)}
      </p>
    </Link>
  );
});

export default function DashboardPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useRouteState('dashboard-search-open', false);
  const [intervalSheetOpen, setIntervalSheetOpen] = useRouteState('dashboard-interval-sheet-open', false);
  const [interval, setInterval] = useRouteState('dashboard-interval', () => createDefaultIntervalState());
  const [searchTerm, setSearchTerm] = useRouteState('dashboard-search-term', '');
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [wealthSummary, setWealthSummary] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);

  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);
  const summaryParams = useMemo(() => intervalSummaryParams(interval), [interval]);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, summaryRes, wealthRes] = await Promise.all([
        fetchAccounts(),
        monthlySummary(summaryParams),
        fetchAssetSummary()
      ]);
      setAccounts(accountsRes.accounts || []);
      setSummary(summaryRes || null);
      setWealthSummary(wealthRes || null);
      setRecentTransactions((summaryRes?.recent_transactions || []).slice(0, 5));
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast, summaryParams]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const totalBalance = useMemo(() => {
    const reported = Number(wealthSummary?.accounts_total_balance);
    if (!Number.isNaN(reported)) return reported;
    return accounts.reduce((sum, account) => {
      return sum + Number(account.current_balance || 0);
    }, 0);
  }, [accounts, wealthSummary?.accounts_total_balance]);
  const totalAssetValue = Number(wealthSummary?.assets_total_current_value || 0);
  const netWorth = Number(wealthSummary?.net_worth || totalBalance + totalAssetValue);

  const expenseValue = Number(summary?.expense_total || 0);
  const incomeValue = Number(summary?.income_total || 0);
  const donutTotal = Math.max(1, expenseValue + incomeValue);
  const expenseRatio = Math.min(100, Math.max(0, (expenseValue / donutTotal) * 100));
  const accountTiles = useMemo(() => {
    return [...accounts]
      .sort((a, b) => Number(b.current_balance || 0) - Number(a.current_balance || 0))
      .slice(0, 6);
  }, [accounts]);
  const filteredRecentTransactions = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return recentTransactions;
    return recentTransactions.filter((txn) =>
      [txn.note, txn.category_name, txn.from_account_name, txn.to_account_name, txn.from_asset_type_name, txn.to_asset_type_name, txn.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [debouncedSearch, recentTransactions]);

  return (
    <AppShell
      title="Home"
      subtitle={`Interval: ${intervalLabel}`}
      onRefresh={loadDashboard}
      searchEnabled
      searchOpen={searchOpen}
      searchValue={searchTerm}
      onToggleSearch={() => setSearchOpen((prev) => !prev)}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search recent"
      filterEnabled
      filterActive={isIntervalFilterActive(interval)}
      onFilter={() => setIntervalSheetOpen(true)}
      contentClassName="gap-1.5"
    >
      <InstallPrompt />

      <section className="grid grid-cols-3 gap-2">
        <div className="card-surface rounded-xl p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Accounts</p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(totalBalance)}</h2>
        </div>
        <div className="card-surface rounded-xl p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Assets</p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(totalAssetValue)}</h2>
        </div>
        <div className="card-surface rounded-xl p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Net Worth</p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(netWorth)}</h2>
        </div>
      </section>

      <section>
        <div className="mb-0.5 flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">Accounts</h3>
          <Link to="/accounts" className="text-[11px] font-semibold text-primary">
            See all
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-[62px] animate-pulse rounded-xl bg-white dark:bg-slate-900" />
            ))}
          </div>
        ) : accountTiles.length ? (
          <div className="grid grid-cols-3 gap-2">
            {accountTiles.map((account) => (
              <AccountTile key={account.id} account={account} />
            ))}
          </div>
        ) : (
          <div className="card-surface rounded-xl p-2">
            <EmptyState title="No accounts yet" subtitle="Create one from Accounts tab." />
          </div>
        )}
      </section>

      <section className="card-surface h-[96px] rounded-xl p-2.5">
        <div className="flex items-center gap-3">
          <div
            className="relative h-20 w-20 rounded-full"
            style={{
              background: `conic-gradient(#dc2626 ${expenseRatio}%, #16a34a ${expenseRatio}% 100%)`
            }}
          >
            <div className="absolute inset-[8px] rounded-full bg-white dark:bg-slate-900" />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200">
              {Math.round(expenseRatio)}%
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {intervalLabel} Expense
            </p>
            <p className="text-base font-semibold text-danger">{formatCurrency(expenseValue)}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Income {formatCurrency(incomeValue)}
            </p>
          </div>
        </div>
      </section>

      <section className="card-surface rounded-xl p-2">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">Recent Transactions</h3>
          <Link to="/transactions/history" className="text-[11px] font-semibold text-primary">
            View All Transactions
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-16 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
            ))}
          </div>
        ) : filteredRecentTransactions.length ? (
          <div className="space-y-2">
            {filteredRecentTransactions.map((txn) => (
              <TransactionItem key={txn.id} txn={txn} onView={() => navigate(`/transactions/${txn.id}`)} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={debouncedSearch ? 'No matching recent transactions' : 'No recent transactions'}
            subtitle={debouncedSearch ? 'Try a different search.' : 'Add income or expense to see activity.'}
          />
        )}

        <Link
          to="/transactions/history"
          className="mt-2 block rounded-xl bg-primary px-3 py-2 text-center text-xs font-semibold text-white"
        >
          Open Full History
        </Link>
      </section>

      <IntervalFilterSheet
        open={intervalSheetOpen}
        onClose={() => setIntervalSheetOpen(false)}
        value={interval}
        onApply={setInterval}
      />
    </AppShell>
  );
}
