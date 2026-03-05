import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import EmptyState from '../../components/EmptyState';
import Icon, { ICON_NAMES, assetIconKey } from '../../components/Icon';
import { useToast } from '../../app/ToastContext';
import { useRouteState } from '../../hooks/useRouteState';
import {
  createAssetType,
  deleteAssetType,
  fetchAssets,
  updateAssetType
} from '../../services/assetService';
import { normalizeApiError } from '../../services/http';
import { formatCurrency } from '../../utils/format';
import { hapticTap } from '../../utils/haptics';

const blankForm = {
  id: null,
  name: '',
  icon: 'asset',
  color: '#7c3aed',
  notes: ''
};

function iconLabel(name) {
  return String(name)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseDeleteDetails(error) {
  return error?.response?.data?.data?.errors || null;
}

export default function AssetTypesPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [searchOpen, setSearchOpen] = useRouteState('asset-types-search-open', false);
  const [searchTerm, setSearchTerm] = useRouteState('asset-types-search-term', '');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [requiresReallocation, setRequiresReallocation] = useState(false);
  const [replacementOptions, setReplacementOptions] = useState([]);
  const [replacementAssetTypeId, setReplacementAssetTypeId] = useState('');
  const [transactionsToMove, setTransactionsToMove] = useState(0);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchAssets();
      setAssets(response.assets || []);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredAssets = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((item) =>
      [item.name, item.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [assets, searchTerm]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      pushToast({ type: 'warning', message: 'Asset type name is required.' });
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        await updateAssetType({
          id: form.id,
          name: form.name.trim(),
          icon: form.icon,
          color: form.color,
          notes: form.notes
        });
        pushToast({ type: 'success', message: 'Asset type updated.' });
      } else {
        await createAssetType({
          name: form.name.trim(),
          icon: form.icon,
          color: form.color,
          notes: form.notes
        });
        pushToast({ type: 'success', message: 'Asset type created.' });
      }
      setForm(blankForm);
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const resetDeleteFlow = () => {
    setDeleteTarget(null);
    setDeleting(false);
    setRequiresReallocation(false);
    setReplacementOptions([]);
    setReplacementAssetTypeId('');
    setTransactionsToMove(0);
  };

  const requestDelete = (asset) => {
    setDeleteTarget(asset);
    setDeleting(false);
    setRequiresReallocation(false);
    setReplacementOptions([]);
    setReplacementAssetTypeId('');
    setTransactionsToMove(0);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const options =
        requiresReallocation && replacementAssetTypeId
          ? { replacement_asset_type_id: Number(replacementAssetTypeId) }
          : {};
      await deleteAssetType(deleteTarget.id, options);
      pushToast({ type: 'success', message: 'Asset type deleted.' });
      resetDeleteFlow();
      await load();
      if (form.id && String(form.id) === String(deleteTarget.id)) {
        setForm(blankForm);
      }
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

  return (
    <AppShell
      title="Assets / Investments"
      subtitle="Manage asset types and open wealth details"
      onRefresh={load}
      showFab={false}
      searchEnabled
      searchOpen={searchOpen}
      searchValue={searchTerm}
      onToggleSearch={() => setSearchOpen((prev) => !prev)}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search asset types"
    >
      <form className="card-surface rounded-xl p-3" onSubmit={onSubmit}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {form.id ? 'Edit asset type' : 'Create asset type'}
        </h3>
        <div className="mt-2 space-y-2">
          <input
            type="text"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Asset type name (Gold, Stocks, Real Estate...)"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <textarea
            rows={2}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
          />
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Icon</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {iconOptions.map((item) => {
                const active = form.icon === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={`rounded-lg border p-2 text-center ${
                      active
                        ? 'border-primary bg-primary/12 text-primary'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                    }`}
                    onClick={() => {
                      hapticTap();
                      setForm((prev) => ({ ...prev, icon: item.value }));
                    }}
                  >
                    <span
                      className="mx-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-white"
                      style={{ backgroundColor: form.color || '#7c3aed' }}
                    >
                      <Icon name={item.value} size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Color</p>
            <input
              type="color"
              className="h-9 w-14 rounded-lg border border-slate-200 bg-white px-1 py-1 dark:border-slate-700 dark:bg-slate-900"
              value={form.color || '#7c3aed'}
              onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
            />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{form.color || '#7c3aed'}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
            >
              {saving ? 'Saving...' : form.id ? 'Update' : 'Create'}
            </button>
            {form.id ? (
              <button
                type="button"
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                onClick={() => setForm(blankForm)}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      </form>

      <section className="mt-2">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-14 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
            ))}
          </div>
        ) : filteredAssets.length ? (
          <div className="card-surface overflow-hidden rounded-xl">
            {filteredAssets.map((asset) => (
              <article key={asset.id} className="border-b border-slate-200/70 px-2 py-2 last:border-b-0 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex flex-1 items-center gap-2 text-left"
                    onClick={() => navigate(`/assets/${asset.id}`)}
                  >
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: asset.color || '#7c3aed' }}
                    >
                      <Icon name={assetIconKey(asset)} size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{asset.name}</p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        Invested {formatCurrency(asset.invested_amount)} | Current {formatCurrency(asset.current_value)}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      onClick={() =>
                        setForm({
                          id: asset.id,
                          name: asset.name || '',
                          icon: asset.icon || 'asset',
                          color: asset.color || '#7c3aed',
                          notes: asset.notes || ''
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-danger px-2 py-1 text-[11px] font-semibold text-white"
                      onClick={() => requestDelete(asset)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No asset types yet" subtitle="Create your first asset type to start wealth tracking." />
        )}
      </section>

      <BottomSheet open={Boolean(deleteTarget)} onClose={resetDeleteFlow} title="Delete Asset Type">
        <div className="space-y-3">
          {!requiresReallocation ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Delete <strong>{deleteTarget?.name}</strong>?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                If transactions are linked, a replacement asset type is required.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                This asset type has {transactionsToMove} linked transaction(s). Select a replacement.
              </p>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={replacementAssetTypeId}
                onChange={(event) => setReplacementAssetTypeId(event.target.value)}
              >
                <option value="">Select replacement asset type</option>
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
              onClick={resetDeleteFlow}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting || (requiresReallocation && !replacementAssetTypeId)}
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
