import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/Icon';
import { useToast } from '../../app/ToastContext';
import { useRouteState } from '../../hooks/useRouteState';
import {
  createBusiness,
  deleteBusiness,
  fetchBusinesses,
  updateBusiness
} from '../../services/businessService';
import { normalizeApiError } from '../../services/http';

const blankForm = {
  id: null,
  name: '',
  notes: ''
};

export default function BusinessesPage() {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [searchOpen, setSearchOpen] = useRouteState('businesses-search-open', false);
  const [searchTerm, setSearchTerm] = useRouteState('businesses-search-term', '');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchBusinesses();
      setBusinesses(response.businesses || []);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredBusinesses = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return businesses;
    return businesses.filter((item) =>
      [item.name, item.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [businesses, searchTerm]);

  const onSubmit = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      pushToast({ type: 'warning', message: 'Business name is required.' });
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        await updateBusiness({
          id: form.id,
          name,
          notes: form.notes
        });
        pushToast({ type: 'success', message: 'Business updated.' });
      } else {
        await createBusiness({
          name,
          notes: form.notes
        });
        pushToast({ type: 'success', message: 'Business created.' });
      }
      setForm(blankForm);
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const resetDelete = () => {
    setDeleteTarget(null);
    setDeleting(false);
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await deleteBusiness(deleteTarget.id);
      const cleared = Number(response.cleared_transactions || 0);
      pushToast({
        type: 'success',
        message: cleared > 0
          ? `Business deleted. Removed from ${cleared} linked transaction(s).`
          : 'Business deleted.'
      });
      if (String(form.id || '') === String(deleteTarget.id)) {
        setForm(blankForm);
      }
      resetDelete();
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title="Businesses"
      subtitle="Track income and expense by business"
      onRefresh={load}
      showFab={false}
      searchEnabled
      searchOpen={searchOpen}
      searchValue={searchTerm}
      onToggleSearch={() => setSearchOpen((prev) => !prev)}
      onSearchChange={setSearchTerm}
      searchPlaceholder="Search businesses"
    >
      <form className="card-surface rounded-xl p-3" onSubmit={onSubmit}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {form.id ? 'Edit business' : 'Add business'}
        </h3>
        <div className="mt-2 space-y-2">
          <input
            type="text"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Business name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <textarea
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
          />
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
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
            ))}
          </div>
        ) : filteredBusinesses.length ? (
          <div className="card-surface overflow-hidden rounded-xl">
            {filteredBusinesses.map((business) => (
              <article
                key={business.id}
                className="border-b border-slate-200/70 px-3 py-3 last:border-b-0 dark:border-slate-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon name="briefcase" size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {business.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {business.transaction_count} linked transaction(s)
                        </p>
                      </div>
                    </div>
                    {business.notes ? (
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{business.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      onClick={() =>
                        setForm({
                          id: business.id,
                          name: business.name || '',
                          notes: business.notes || ''
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-danger px-2 py-1 text-[11px] font-semibold text-white"
                      onClick={() => setDeleteTarget(business)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No businesses yet" subtitle="Create a business to tag income and expense transactions." />
        )}
      </section>

      <BottomSheet open={Boolean(deleteTarget)} onClose={resetDelete} title="Delete Business">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Delete <strong>{deleteTarget?.name}</strong>?
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            If this business is linked to transactions, those transactions will stay in history but their business tag will be removed.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              onClick={resetDelete}
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
