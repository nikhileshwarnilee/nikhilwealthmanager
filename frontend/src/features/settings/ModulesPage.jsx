import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import { useAuth } from '../../app/AuthContext';
import { useToast } from '../../app/ToastContext';
import { normalizeApiError } from '../../services/http';
import { getSettings, updateSettings } from '../../services/settingsService';
import { normalizeAllowedModules, normalizeModules } from '../../utils/modules';

const moduleCatalog = [
  {
    key: 'businesses',
    title: 'Businesses',
    description: 'Track income and expenses by business, manage business master data, and use business filters in reports.'
  },
  {
    key: 'ledger',
    title: 'Ledger',
    description: 'Track customers and suppliers, pending receivables/payables, and convert them into real income or expense entries.'
  },
  {
    key: 'assets',
    title: 'Assets / Wealth',
    description: 'Manage asset types, track wealth, investments, current values, and asset-side analytics.'
  },
  {
    key: 'users_access',
    title: 'Users & Access',
    description: 'Manage workspace users, permissions, transaction attribution, and user-based filters across reports.'
  }
];

export default function ModulesPage() {
  const { settings, setSettings } = useAuth();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modules, setModules] = useState(() => normalizeModules(settings?.modules));

  const normalizedModules = useMemo(() => normalizeModules(modules), [modules]);
  const allowedModules = useMemo(() => normalizeAllowedModules(settings), [settings]);
  const visibleCatalog = useMemo(
    () => moduleCatalog.filter((module) => allowedModules[module.key]),
    [allowedModules]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getSettings();
      const nextSettings = response.settings || null;
      setSettings(nextSettings);
      setModules(normalizeModules(nextSettings?.modules));
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast, setSettings]);

  useEffect(() => {
    load();
  }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      const response = await updateSettings({
        modules: normalizedModules
      });
      setSettings(response.settings || null);
      setModules(normalizeModules(response.settings?.modules));
      pushToast({ type: 'success', message: 'Modules updated.' });
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Modules" subtitle="Turn app modules on or off" showFab={false} onRefresh={load}>
      <div className="space-y-3">
        <section className="card-surface rounded-xl p-3">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Available Modules</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Keep this page for future add-ons too. Turning a module off hides it from the app UI.
          </p>
        </section>

        {loading ? (
          Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-white dark:bg-slate-900" />
          ))
        ) : (
          visibleCatalog.map((module) => {
            const enabled = Boolean(normalizedModules[module.key]);
            return (
              <section key={module.key} className="card-surface rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{module.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{module.description}</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={enabled}
                      onChange={(event) =>
                        setModules((prev) => ({
                          ...normalizeModules(prev),
                          [module.key]: event.target.checked
                        }))
                      }
                    />
                    <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-primary">
                      <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
                    </span>
                  </label>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {enabled ? 'Active' : 'Inactive'}
                  </span>
                  {module.key === 'businesses' && enabled ? <Link to="/businesses" className="font-semibold text-primary">Open</Link> : null}
                  {module.key === 'ledger' && enabled ? <Link to="/ledger" className="font-semibold text-primary">Open</Link> : null}
                  {module.key === 'assets' && enabled ? <Link to="/assets" className="font-semibold text-primary">Open</Link> : null}
                  {module.key === 'users_access' && enabled ? <Link to="/settings/users" className="font-semibold text-primary">Open</Link> : null}
                </div>
              </section>
            );
          })
        )}

        {!loading && !visibleCatalog.length ? (
          <section className="card-surface rounded-xl p-3">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">No module controls available</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Your super admin has already hidden module-based areas for this account.
            </p>
          </section>
        ) : null}

        {visibleCatalog.length ? (
          <button
            type="button"
            disabled={loading || saving}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
            onClick={onSave}
          >
            {saving ? 'Saving...' : 'Save Modules'}
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}
