import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import EmptyState from '../../components/EmptyState';
import HorizontalSelector from '../../components/HorizontalSelector';
import Icon from '../../components/Icon';
import { useToast } from '../../app/ToastContext';
import {
  accountSummary,
  adjustOpeningBalance,
  createAccount,
  deleteAccount,
  fetchAccounts,
  updateAccount
} from '../../services/accountService';
import { normalizeApiError } from '../../services/http';
import { formatCurrency } from '../../utils/format';

const blankForm = {
  id: null,
  name: '',
  type: 'cash',
  initial_balance: ''
};

const typeOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'upi', label: 'UPI' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'credit', label: 'Credit' },
  { value: 'people', label: 'People' }
];

const AccountCard = memo(function AccountCard({ account, onEdit, onDelete }) {
  return (
    <article className="border-b border-slate-200/70 last:border-b-0 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60">
        <Link to={`/accounts/${account.id}`} className="min-w-0 flex flex-1 items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon name={account.type} size={14} />
          </span>
          <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{account.name}</h4>
        </Link>
        <div className="flex items-center gap-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(account.current_balance)}
          </p>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onEdit(account);
            }}
            aria-label="Edit account"
          >
            <Icon name="edit" size={13} />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-100 text-danger dark:bg-red-900/30"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete(account);
            }}
            aria-label="Delete account"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
    </article>
  );
});

export default function AccountsPage() {
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustValue, setAdjustValue] = useState('0');
  const [form, setForm] = useState(blankForm);
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, sumRes] = await Promise.all([fetchAccounts(), accountSummary()]);
      setAccounts(accRes.accounts || []);
      setSummary(sumRes || null);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || !accounts.length) return;
    const found = accounts.find((item) => String(item.id) === String(editId));
    if (found) {
      setForm({
        id: found.id,
        name: found.name,
        type: found.type,
        initial_balance: String(found.initial_balance || 0)
      });
      setAdjustValue(String(found.initial_balance || 0));
      setShowForm(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('edit');
    setSearchParams(next, { replace: true });
  }, [accounts, searchParams, setSearchParams]);

  const orderedAccounts = useMemo(
    () =>
      [...accounts].sort((a, b) => {
        return Number(b.current_balance || 0) - Number(a.current_balance || 0);
      }),
    [accounts]
  );

  const openCreateForm = () => {
    setForm(blankForm);
    setShowForm(true);
  };

  const onSave = async () => {
    if (!form.name.trim()) {
      pushToast({ type: 'warning', message: 'Account name required.' });
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await updateAccount({
          id: form.id,
          name: form.name.trim(),
          type: form.type
        });
        pushToast({ type: 'success', message: 'Account updated.' });
      } else {
        await createAccount({
          name: form.name.trim(),
          type: form.type,
          initial_balance: Number(form.initial_balance || 0)
        });
        pushToast({ type: 'success', message: 'Account created.' });
      }

      setForm(blankForm);
      setShowForm(false);
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (account) => {
    setForm({
      id: account.id,
      name: account.name,
      type: account.type,
      initial_balance: String(account.initial_balance || 0)
    });
    setAdjustValue(String(account.initial_balance || 0));
    setShowForm(true);
  };

  const closeDeleteFlow = () => {
    setDeleteTarget(null);
    setDeleting(false);
  };

  const requestDelete = (account) => {
    setDeleteTarget(account);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    if (Math.abs(Number(deleteTarget.current_balance || 0)) >= 0.01) {
      pushToast({
        type: 'warning',
        message: 'Only zero-balance accounts can be deleted. Settle or transfer remaining balance first.'
      });
      return;
    }

    setDeleting(true);
    try {
      await deleteAccount(deleteTarget.id);
      pushToast({ type: 'success', message: 'Account deleted.' });
      closeDeleteFlow();
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      setDeleting(false);
    }
  };

  const submitAdjustOpening = async () => {
    if (!form.id) return;
    if (!adjustValue || Number.isNaN(Number(adjustValue))) {
      pushToast({ type: 'warning', message: 'Enter a valid opening balance.' });
      return;
    }

    setAdjusting(true);
    try {
      const response = await adjustOpeningBalance({
        account_id: form.id,
        new_initial_balance: Number(adjustValue)
      });
      const updated = response?.account;
      if (updated) {
        setForm((prev) => ({
          ...prev,
          initial_balance: String(updated.initial_balance || 0)
        }));
      }
      pushToast({ type: 'success', message: 'Opening balance adjusted.' });
      setShowAdjust(false);
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <AppShell title="Accounts" subtitle="Tap account to view details" onRefresh={load} showFab={false}>
      <section className="card-surface rounded-2xl p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Balance</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
          {formatCurrency(summary?.total_balance || 0)}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">{summary?.accounts_count || 0} accounts</p>
      </section>

      <section className="mt-3">
        <button
          type="button"
          className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
          onClick={openCreateForm}
        >
          Add Account
        </button>
      </section>

      <section className="mt-3 space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-12 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
          ))
        ) : orderedAccounts.length ? (
          <div className="card-surface overflow-hidden rounded-xl">
            {orderedAccounts.map((account) => (
              <AccountCard key={account.id} account={account} onEdit={onEdit} onDelete={requestDelete} />
            ))}
          </div>
        ) : (
          <EmptyState title="No accounts found" subtitle="Create your first account to start tracking." />
        )}
      </section>

      <BottomSheet open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Account' : 'New Account'}>
        <div className="space-y-3">
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Account name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />

          <HorizontalSelector
            items={typeOptions}
            selected={form.type}
            onSelect={(value) => setForm((prev) => ({ ...prev, type: value }))}
            iconKey={(item) => item.value}
          />

          {form.id ? (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Opening balance is locked on edit.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current opening: {formatCurrency(Number(form.initial_balance || 0))}
              </p>
              <button
                type="button"
                className="w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-slate-700"
                onClick={() => setShowAdjust(true)}
              >
                Adjust Opening Balance
              </button>
            </div>
          ) : (
            <input
              type="number"
              step="0.01"
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Initial balance"
              value={form.initial_balance}
              onChange={(event) => setForm((prev) => ({ ...prev, initial_balance: event.target.value }))}
            />
          )}

          <button
            type="button"
            disabled={saving}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
            onClick={onSave}
          >
            {saving ? 'Saving...' : form.id ? 'Update Account' : 'Create Account'}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={showAdjust} onClose={() => setShowAdjust(false)} title="Adjust Opening Balance">
        <div className="space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            This updates opening balance directly. No transaction entry is created.
          </p>
          <input
            type="number"
            step="0.01"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={adjustValue}
            onChange={(event) => setAdjustValue(event.target.value)}
            placeholder="New opening balance"
          />
          <button
            type="button"
            disabled={adjusting}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
            onClick={submitAdjustOpening}
          >
            {adjusting ? 'Applying...' : 'Apply Adjustment'}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={Boolean(deleteTarget)} onClose={closeDeleteFlow} title="Delete Account">
        <div className="space-y-3">
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Delete <strong>{deleteTarget?.name}</strong>?
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Current balance: {formatCurrency(Number(deleteTarget?.current_balance || 0))}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deleting an account removes it from Accounts. Its existing transactions will stay in Transactions history.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You can delete only when account balance is exactly zero.
            </p>
            {Math.abs(Number(deleteTarget?.current_balance || 0)) >= 0.01 ? (
              <p className="rounded-lg bg-amber-50 px-2 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                This account cannot be deleted right now because balance is not zero.
              </p>
            ) : null}
          </>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              onClick={closeDeleteFlow}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              onClick={submitDelete}
            >
              {deleting ? 'Processing...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </AppShell>
  );
}
