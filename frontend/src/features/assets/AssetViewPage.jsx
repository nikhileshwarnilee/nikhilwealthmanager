import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import CollapsibleIntervalSection from '../../components/CollapsibleIntervalSection';
import EmptyState from '../../components/EmptyState';
import Icon, { ICON_NAMES, assetIconKey } from '../../components/Icon';
import TransactionItem from '../../components/TransactionItem';
import { useToast } from '../../app/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { usePaginatedTransactions } from '../../hooks/usePaginatedTransactions';
import { useRouteState } from '../../hooks/useRouteState';
import {
  deleteAssetType,
  fetchAssetView,
  updateAssetType,
  updateAssetValue
} from '../../services/assetService';
import { normalizeApiError } from '../../services/http';
import { datetimeLocalNow, formatCurrency } from '../../utils/format';
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

function iconLabel(name) {
  return String(name)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function AssetViewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const assetId = Number(id || 0);
  const { pushToast } = useToast();

  const [loadingAsset, setLoadingAsset] = useState(true);
  const [assetLoadError, setAssetLoadError] = useState('');
  const [assetData, setAssetData] = useState(null);
  const [interval, setInterval] = useRouteState(`asset-${assetId}-interval`, () => createDefaultIntervalState());
  const [searchOpen, setSearchOpen] = useRouteState(`asset-${assetId}-search-open`, false);
  const [searchTerm, setSearchTerm] = useRouteState(`asset-${assetId}-search-term`, '');
  const [showValueSheet, setShowValueSheet] = useState(false);
  const [valueSaving, setValueSaving] = useState(false);
  const [valueForm, setValueForm] = useState({
    current_value: '',
    recorded_at: datetimeLocalNow(),
    note: ''
  });

  const [showEditSheet, setShowEditSheet] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    icon: 'asset',
    color: '#7c3aed',
    notes: ''
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [requiresReallocation, setRequiresReallocation] = useState(false);
  const [replacementOptions, setReplacementOptions] = useState([]);
  const [replacementAssetTypeId, setReplacementAssetTypeId] = useState('');
  const [transactionsToMove, setTransactionsToMove] = useState(0);

  const loadMoreRef = useRef(null);
  const debouncedSearch = useDebounce(searchTerm, 300);
  const intervalLabel = useMemo(() => intervalDisplayLabel(interval), [interval]);
  const iconOptions = useMemo(
    () =>
      ICON_NAMES.filter((name) =>
        ['asset', 'gold', 'silver', 'stocks', 'mutual', 'realestate', 'deposit', 'crypto', 'vehicle', 'bank', 'wallet', 'cash'].includes(name)
      ).map((name) => ({
        value: name,
        label: iconLabel(name)
      })),
    []
  );

  const loadAsset = useCallback(async () => {
    if (!assetId) return;
    setLoadingAsset(true);
    setAssetLoadError('');
    try {
      const response = await fetchAssetView(assetId, intervalSummaryParams(interval));
      setAssetData(response || null);
      const asset = response?.asset;
      if (asset) {
        setValueForm((prev) => ({
          ...prev,
          current_value: String(asset.current_value || 0)
        }));
        setEditForm({
          name: asset.name || '',
          icon: asset.icon || 'asset',
          color: asset.color || '#7c3aed',
          notes: asset.notes || ''
        });
      }
    } catch (error) {
      const message = normalizeApiError(error);
      pushToast({ type: 'danger', message });
      setAssetLoadError(message);
      setAssetData(null);
    } finally {
      setLoadingAsset(false);
    }
  }, [assetId, interval, pushToast]);

  useEffect(() => {
    loadAsset();
  }, [loadAsset]);

  const transactionQuery = useMemo(
    () => ({
      ...(intervalDateRange(interval) || {}),
      type: 'asset',
      asset_type_id: assetId
    }),
    [assetId, interval]
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
    reload: reloadTransactions,
    loadMore
  } = usePaginatedTransactions(transactionQuery, {
    pageSize: 100,
    onError: onTransactionError,
    enabled: Boolean(assetId)
  });
  useInfiniteScroll(loadMoreRef, loadMore, hasMore && !loading && !loadingMore);

  const filteredTransactions = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter((txn) =>
      [
        txn.note,
        txn.from_account_name,
        txn.to_account_name,
        txn.from_asset_type_name,
        txn.to_asset_type_name,
        txn.type
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [debouncedSearch, transactions]);

  const asset = assetData?.asset || null;
  const investmentHistory = assetData?.investment_history || [];
  const valueSeries = assetData?.value_series || [];

  const onSaveValue = async () => {
    if (!asset) return;
    if (!valueForm.current_value || Number.isNaN(Number(valueForm.current_value))) {
      pushToast({ type: 'warning', message: 'Enter a valid current value.' });
      return;
    }

    setValueSaving(true);
    try {
      await updateAssetValue({
        asset_type_id: asset.id,
        current_value: Number(valueForm.current_value),
        recorded_at: valueForm.recorded_at ? `${valueForm.recorded_at.replace('T', ' ')}:00` : null,
        note: valueForm.note || ''
      });
      pushToast({ type: 'success', message: 'Asset value updated.' });
      setShowValueSheet(false);
      await loadAsset();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setValueSaving(false);
    }
  };

  const onSaveAssetType = async () => {
    if (!asset) return;
    if (!editForm.name.trim()) {
      pushToast({ type: 'warning', message: 'Asset type name is required.' });
      return;
    }

    setEditSaving(true);
    try {
      await updateAssetType({
        id: asset.id,
        name: editForm.name.trim(),
        icon: editForm.icon || 'asset',
        color: editForm.color || '#7c3aed',
        notes: editForm.notes || ''
      });
      pushToast({ type: 'success', message: 'Asset details updated.' });
      setShowEditSheet(false);
      await loadAsset();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setEditSaving(false);
    }
  };

  const onDeleteAsset = async () => {
    if (!asset) return;
    setDeleting(true);
    try {
      const options =
        requiresReallocation && replacementAssetTypeId
          ? { replacement_asset_type_id: Number(replacementAssetTypeId) }
          : {};
      await deleteAssetType(asset.id, options);
      pushToast({ type: 'success', message: 'Asset deleted.' });
      setConfirmDelete(false);
      navigate('/assets', { replace: true });
    } catch (error) {
      const details = parseDeleteDetails(error);
      if (error?.response?.status === 409 && details?.requires_reallocation) {
        setRequiresReallocation(true);
        setReplacementOptions(details.asset_types || []);
        setTransactionsToMove(Number(details.transaction_count || 0));
        const first = (details.asset_types || [])[0];
        setReplacementAssetTypeId(first ? String(first.id) : '');
        setDeleting(false);
        return;
      }
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      setDeleting(false);
    }
  };

  const closeDelete = () => {
    setConfirmDelete(false);
    setDeleting(false);
    setRequiresReallocation(false);
    setReplacementOptions([]);
    setReplacementAssetTypeId('');
    setTransactionsToMove(0);
  };

  const onSwipePrevInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, -1));
  }, []);
  const onSwipeNextInterval = useCallback(() => {
    setInterval((prev) => shiftIntervalState(prev, 1));
  }, []);

  return (
    <AppShell
      title={asset?.name || 'Asset'}
      subtitle={`Asset detail - ${intervalLabel}`}
      onRefresh={async () => {
        await Promise.all([loadAsset(), reloadTransactions()]);
      }}
      showFab={false}
      searchEnabled
      searchOpen={searchOpen}
      searchValue={searchTerm}
      onToggleSearch={() => setSearchOpen((prev) => !prev)}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search asset transactions"
      intervalSwipeEnabled={interval.mode !== 'all_time'}
      onIntervalSwipePrev={onSwipePrevInterval}
      onIntervalSwipeNext={onSwipeNextInterval}
    >
      {loadingAsset ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
          ))}
        </div>
      ) : assetLoadError ? (
        <section className="card-surface rounded-xl p-3">
          <EmptyState title="Unable to load asset" subtitle={assetLoadError} />
        </section>
      ) : asset ? (
        <>
          <section className="card-surface rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: asset.color || '#7c3aed' }}
                >
                  <Icon name={assetIconKey(asset)} size={18} />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{asset.name}</h2>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{asset.notes || 'No notes'}</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg bg-primary px-2 py-1 text-[11px] font-semibold text-white"
                onClick={() => setShowValueSheet(true)}
              >
                Update Value
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Invested</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(asset.invested_amount || 0)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Current</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(asset.current_value || 0)}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Gain / Loss</p>
                <p className={`mt-1 font-semibold ${Number(asset.gain_loss || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatCurrency(asset.gain_loss || 0)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Gain %</p>
                <p className={`mt-1 font-semibold ${Number(asset.gain_loss || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                  {Number(asset.gain_loss_percent || 0).toFixed(2)}%
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
                onClick={() => setShowEditSheet(true)}
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
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Investment History</h3>
            {investmentHistory.length ? (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={investmentHistory}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Bar dataKey="net_invested" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No investment history" subtitle="No asset movements in this interval." />
            )}
          </section>

          <section className="card-surface rounded-xl p-2">
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Value History</h3>
            {valueSeries.length ? (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={valueSeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No value updates" subtitle="Use Update Value to record market valuations." />
            )}
          </section>

          <section className="card-surface rounded-xl p-2">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Asset Transactions</h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {filteredTransactions.length}/{transactions.length} loaded ({totalCount} total)
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
                  <TransactionItem key={txn.id} txn={txn} onView={() => navigate(`/transactions/${txn.id}`)} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={debouncedSearch ? 'No matching asset transactions' : 'No asset transactions'}
                subtitle={debouncedSearch ? 'Try a different search term.' : 'Create an Asset / Investment transaction.'}
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
          </section>
        </>
      ) : (
        <section className="card-surface rounded-xl p-3">
          <EmptyState title="Asset not found" subtitle="The selected asset does not exist." />
        </section>
      )}

      <BottomSheet open={showValueSheet} onClose={() => setShowValueSheet(false)} title="Update Current Value">
        <div className="space-y-3">
          <input
            type="number"
            step="0.01"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Current value"
            value={valueForm.current_value}
            onChange={(event) => setValueForm((prev) => ({ ...prev, current_value: event.target.value }))}
          />
          <input
            type="datetime-local"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={valueForm.recorded_at}
            onChange={(event) => setValueForm((prev) => ({ ...prev, recorded_at: event.target.value }))}
          />
          <textarea
            rows={2}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Notes (optional)"
            value={valueForm.note}
            onChange={(event) => setValueForm((prev) => ({ ...prev, note: event.target.value }))}
          />
          <button
            type="button"
            disabled={valueSaving}
            className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
            onClick={onSaveValue}
          >
            {valueSaving ? 'Saving...' : 'Save value update'}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={showEditSheet} onClose={() => setShowEditSheet(false)} title="Edit Asset Type">
        <div className="space-y-3">
          <input
            type="text"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Asset type name"
            value={editForm.name}
            onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Color</p>
            <input
              type="color"
              className="h-9 w-14 rounded-lg border border-slate-200 bg-white px-1 py-1 dark:border-slate-700 dark:bg-slate-900"
              value={editForm.color || '#7c3aed'}
              onChange={(event) => setEditForm((prev) => ({ ...prev, color: event.target.value }))}
            />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{editForm.color || '#7c3aed'}</span>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Icon</p>
            <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
              {iconOptions.map((item) => {
                const active = editForm.icon === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={`rounded-lg border p-2 text-center ${
                      active
                        ? 'border-primary bg-primary/12 text-primary'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                    }`}
                    onClick={() => setEditForm((prev) => ({ ...prev, icon: item.value }))}
                    title={item.label}
                  >
                    <span
                      className="mx-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-white"
                      style={{ backgroundColor: editForm.color || '#7c3aed' }}
                    >
                      <Icon name={item.value} size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <textarea
            rows={2}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Notes"
            value={editForm.notes}
            onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
          />
          <button
            type="button"
            disabled={editSaving}
            className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
            onClick={onSaveAssetType}
          >
            {editSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={confirmDelete} onClose={closeDelete} title="Delete Asset Type">
        <div className="space-y-3">
          {!requiresReallocation ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Delete this asset type? If linked transactions exist, replacement is required.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                This asset has {transactionsToMove} linked transaction(s). Choose a replacement asset type.
              </p>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={replacementAssetTypeId}
                onChange={(event) => setReplacementAssetTypeId(event.target.value)}
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
              disabled={deleting || (requiresReallocation && !replacementAssetTypeId)}
              className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              onClick={onDeleteAsset}
            >
              {deleting ? 'Processing...' : 'Delete'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </AppShell>
  );
}
