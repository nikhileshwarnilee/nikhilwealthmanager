import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import Icon, { assetIconKey, categoryIconKey } from '../../components/Icon';
import { useToast } from '../../app/ToastContext';
import { normalizeApiError } from '../../services/http';
import { deleteTransaction, fetchTransactionView } from '../../services/transactionService';
import { formatCurrency, formatDateTime } from '../../utils/format';

export default function TransactionViewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const transactionId = Number(id || 0);
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transaction, setTransaction] = useState(null);

  const load = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);
    try {
      const response = await fetchTransactionView(transactionId);
      setTransaction(response.transaction || null);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast, transactionId]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryIcon = useMemo(() => {
    if (transaction?.type === 'asset') {
      return assetIconKey({
        icon: transaction?.account?.to_asset?.icon || transaction?.account?.from_asset?.icon,
        name: transaction?.account?.to_asset?.name || transaction?.account?.from_asset?.name
      });
    }
    if (!transaction?.category) return 'transactions';
    return categoryIconKey(transaction.category);
  }, [transaction]);
  const assetLabel = useMemo(() => {
    if (transaction?.type !== 'asset') return '';
    const toAsset = transaction?.account?.to_asset?.name;
    const fromAsset = transaction?.account?.from_asset?.name;
    if (toAsset) return toAsset;
    if (fromAsset) return fromAsset;
    return 'Asset';
  }, [transaction]);
  const categoryColor = String(transaction?.category?.color || '').trim();
  const receiptExt = String(transaction?.receipt || '').split('.').pop()?.toLowerCase() || '';
  const isImageReceipt = ['jpg', 'jpeg', 'png'].includes(receiptExt);

  const onDelete = async () => {
    if (!transaction) return;
    setDeleting(true);
    try {
      await deleteTransaction(transaction.id);
      pushToast({ type: 'success', message: 'Transaction deleted.' });
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/transactions/history', { replace: true });
      }
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title="Transaction"
      subtitle={transaction?.type ? String(transaction.type).toUpperCase() : 'Read only details'}
      onRefresh={load}
      showFab={false}
      contentScrollable={false}
      contentClassName="gap-2"
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
          ))}
        </div>
      ) : transaction ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <section className="card-surface rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                    categoryColor ? 'text-white' : 'bg-primary/10 text-primary'
                  }`}
                  style={categoryColor ? { backgroundColor: categoryColor } : undefined}
                >
                  <Icon name={categoryIcon} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {transaction.type}
                  </p>
                  <h2 className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {transaction.type === 'asset' ? assetLabel : transaction.category?.name || 'Uncategorized'}
                  </h2>
                </div>
              </div>
              <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {formatCurrency(transaction.amount)}
              </p>
            </div>
          </section>

          <section className="card-surface rounded-xl p-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Account</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{transaction.account?.name || '-'}</p>
              </div>
              {transaction.type === 'asset' ? (
                <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                  <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Asset</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {transaction.account?.to_asset?.name || transaction.account?.from_asset?.name || '-'}
                  </p>
                </div>
              ) : null}
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Date</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatDateTime(transaction.date)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Tags</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {(transaction.tags || []).length ? transaction.tags.join(', ') : '-'}
                </p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Location</p>
                <p className="mt-1 flex items-center gap-1 font-semibold text-slate-900 dark:text-slate-100">
                  <Icon name="location" size={14} />
                  <span>{transaction.location || '-'}</span>
                </p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Receipt</p>
                {transaction.receipt ? (
                  transaction.receipt_url && isImageReceipt ? (
                    <a href={transaction.receipt_url} target="_blank" rel="noreferrer" className="mt-1 block">
                      <img src={transaction.receipt_url} alt="Receipt" className="h-16 w-full rounded-lg object-cover" />
                    </a>
                  ) : (
                    <a
                      href={transaction.receipt_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary"
                    >
                      <Icon name="file" size={14} />
                      <span>Open receipt</span>
                    </a>
                  )
                ) : (
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">-</p>
                )}
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Recurring</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {transaction.recurring_info?.is_recurring ? 'Yes' : 'No'}
                </p>
              </div>
            </div>

            <div className="mt-2 rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
              <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Note</p>
              <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">{transaction.note || '-'}</p>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <p>Created: {formatDateTime(transaction.created_at)}</p>
              <p>Updated: {formatDateTime(transaction.updated_at)}</p>
            </div>
          </section>

          <section className="mt-auto grid grid-cols-3 gap-2">
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
              onClick={() => navigate(`/transactions/${transaction.id}/edit`)}
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
          </section>
        </div>
      ) : (
        <section className="card-surface rounded-xl p-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">Transaction not found.</p>
        </section>
      )}

      <BottomSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete Transaction">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This action will remove the transaction and recalculate balances.
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
