import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import BottomSheet from '../../components/BottomSheet';
import { useAuth } from '../../app/AuthContext';
import { useToast } from '../../app/ToastContext';
import { fetchAccounts } from '../../services/accountService';
import { createAdminUser, deleteAdminUser, fetchAdminUsers, updateAdminUser } from '../../services/adminUserService';
import { normalizeApiError } from '../../services/http';
import UserAccessForm from './UserAccessForm';
import {
  canManageUsers,
  DEFAULT_FEATURE_PERMISSIONS,
  DEFAULT_TRANSACTION_ACCESS,
  isSuperAdmin,
  normalizeFeaturePermissions,
  normalizeTransactionAccess,
  transactionScopeLabel
} from '../../utils/permissions';

const featureCatalog = [
  {
    key: 'transactions',
    title: 'Transactions',
    description: 'Income, expenses, transfers, history, and transaction entries.'
  },
  {
    key: 'accounts',
    title: 'Accounts',
    description: 'Accounts list, balances, and account-level drilldowns.'
  },
  {
    key: 'categories',
    title: 'Categories',
    description: 'Income and expense categories with editing access.'
  },
  {
    key: 'budgets',
    title: 'Budgets',
    description: 'Budget plans, alerts, and budget-vs-actual pages.'
  },
  {
    key: 'charts',
    title: 'Charts',
    description: 'Dashboard chart pages and analytics visual summaries.'
  },
  {
    key: 'reports',
    title: 'Reports',
    description: 'Detailed report pages and report drilldowns.'
  },
  {
    key: 'businesses',
    title: 'Businesses',
    description: 'Business master data, business filters, and business-linked transactions.'
  },
  {
    key: 'ledger',
    title: 'Ledger',
    description: 'Customers, suppliers, open items, and ledger conversions.'
  },
  {
    key: 'assets',
    title: 'Assets / Wealth',
    description: 'Asset types, valuations, wealth pages, and asset analytics.'
  }
];

function createBaseForm() {
  return {
    id: null,
    name: '',
    email: '',
    password: '',
    role: 'user',
    is_active: true,
    allowed_account_ids: [],
    default_account_id: '',
    permissions: { ...DEFAULT_FEATURE_PERMISSIONS },
    transaction_access: { ...DEFAULT_TRANSACTION_ACCESS }
  };
}

function formFromUser(record) {
  return {
    id: record?.id || null,
    name: record?.name || '',
    email: record?.email || '',
    password: '',
    role: record?.role || 'user',
    is_active: Boolean(record?.is_active),
    allowed_account_ids: Array.isArray(record?.allowed_account_ids)
      ? record.allowed_account_ids.map((value) => String(value))
      : [],
    default_account_id: record?.default_account_id ? String(record.default_account_id) : '',
    permissions: normalizeFeaturePermissions(record?.permissions),
    transaction_access: normalizeTransactionAccess(record?.transaction_access)
  };
}

export default function UsersPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [users, setUsers] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(() => createBaseForm());
  const [accountSetupLoading, setAccountSetupLoading] = useState(false);
  const [managedAccounts, setManagedAccounts] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchAdminUsers();
      setUsers(response.users || []);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (!canManageUsers(user)) return;
    load();
  }, [load, user]);

  const summary = useMemo(() => {
    const total = users.length;
    const active = users.filter((item) => item.is_active).length;
    const superAdmins = users.filter((item) => isSuperAdmin(item)).length;
    return { total, active, superAdmins };
  }, [users]);

  const loadWorkspaceAccounts = useCallback(async (managedUserId = null) => {
    setAccountSetupLoading(true);
    try {
      const response = await fetchAccounts({
        include_archived: 1,
        ...(managedUserId ? { managed_user_id: managedUserId } : {})
      });
      setManagedAccounts(response.accounts || []);
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setAccountSetupLoading(false);
    }
  }, [pushToast]);

  const openCreate = async () => {
    setForm({
      ...createBaseForm(),
      permissions: { ...DEFAULT_FEATURE_PERMISSIONS }
    });
    setManagedAccounts([]);
    setSheetOpen(true);
    await loadWorkspaceAccounts();
  };

  const openEdit = async (record) => {
    setForm(formFromUser(record));
    setManagedAccounts([]);
    setSheetOpen(true);
    await loadWorkspaceAccounts(record.id);
  };

  const closeSheet = () => {
    if (saving) return;
    setSheetOpen(false);
    setForm(createBaseForm());
    setManagedAccounts([]);
    setAccountSetupLoading(false);
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const togglePermission = (key) => {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...normalizeFeaturePermissions(prev.permissions),
        [key]: !normalizeFeaturePermissions(prev.permissions)[key]
      }
    }));
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    const payload = {
      ...form,
      allowed_account_ids: (form.allowed_account_ids || []).map((value) => Number(value)).filter(Boolean),
      default_account_id: form.default_account_id ? Number(form.default_account_id) : null,
      permissions: normalizeFeaturePermissions(form.permissions),
      transaction_access: normalizeTransactionAccess(form.transaction_access)
    };

    if (!payload.name.trim()) {
      pushToast({ type: 'warning', message: 'Name is required.' });
      return;
    }
    if (!payload.email.trim()) {
      pushToast({ type: 'warning', message: 'Email is required.' });
      return;
    }
    if (!payload.id && !payload.password.trim()) {
      pushToast({ type: 'warning', message: 'Password is required for new users.' });
      return;
    }

    setSaving(true);
    try {
      if (payload.id) {
        await updateAdminUser(payload);
        pushToast({ type: 'success', message: 'User access updated.' });
      } else {
        await createAdminUser(payload);
        pushToast({ type: 'success', message: 'User created.' });
      }
      setSheetOpen(false);
      setForm(createBaseForm());
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await deleteAdminUser(deleteTarget.id);
      pushToast({ type: 'success', message: 'User deleted from the workspace.' });
      setDeleteTarget(null);
      await load();
    } catch (error) {
      pushToast({ type: 'danger', message: normalizeApiError(error) });
    } finally {
      setDeleting(false);
    }
  };

  const accountScopeRestricted = form.allowed_account_ids.length > 0;
  const toggleAllowedAccount = (accountId) => {
    const idValue = String(accountId);
    setForm((prev) => {
      const current = new Set((prev.allowed_account_ids || []).map(String));
      if (current.has(idValue)) {
        current.delete(idValue);
      } else {
        current.add(idValue);
      }
      const nextAllowed = Array.from(current);
      const nextDefault =
        prev.default_account_id && nextAllowed.includes(String(prev.default_account_id))
          ? prev.default_account_id
          : nextAllowed[0] || '';

      return {
        ...prev,
        allowed_account_ids: nextAllowed,
        default_account_id: nextDefault
      };
    });
  };

  if (!canManageUsers(user)) {
    return (
      <AppShell title="Users & Access" subtitle="Super admin only" showFab={false}>
        <div className="card-surface rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Access restricted</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Only super admin can manage users and permissions.
          </p>
        </div>
      </AppShell>
    );
  }

  if (sheetOpen) {
    return (
      <AppShell
        title={form.id ? 'Edit User' : 'Add User'}
        subtitle="Create login access and control permissions"
        showFab={false}
      >
        <UserAccessForm
          form={form}
          saving={saving}
          featureCatalog={featureCatalog}
          accountScopeRestricted={accountScopeRestricted}
          accountSetupLoading={accountSetupLoading}
          managedAccounts={managedAccounts}
          onCancel={closeSheet}
          onSave={onSave}
          onFieldChange={updateField}
          onRoleChange={(role) => updateField('role', role)}
          onTogglePermission={togglePermission}
          onEnableAll={() => updateField('permissions', { ...DEFAULT_FEATURE_PERMISSIONS })}
          onDisableAll={() =>
            updateField(
              'permissions',
              Object.fromEntries(Object.keys(DEFAULT_FEATURE_PERMISSIONS).map((key) => [key, false]))
            )
          }
          onTransactionScopeChange={(action, scope) =>
            setForm((prev) => ({
              ...prev,
              transaction_access: {
                ...normalizeTransactionAccess(prev.transaction_access),
                [action]: scope
              }
            }))
          }
          onAllowAllAccounts={() =>
            setForm((prev) => ({
              ...prev,
              allowed_account_ids: []
            }))
          }
          onRestrictAccounts={() =>
            setForm((prev) => ({
              ...prev,
              allowed_account_ids:
                prev.allowed_account_ids && prev.allowed_account_ids.length
                  ? prev.allowed_account_ids
                  : managedAccounts[0]
                    ? [String(managedAccounts[0].id)]
                    : [],
              default_account_id:
                prev.default_account_id
                || (managedAccounts[0] ? String(managedAccounts[0].id) : '')
            }))
          }
          onDefaultAccountChange={(value) => updateField('default_account_id', value)}
          onToggleAllowedAccount={toggleAllowedAccount}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Users & Access" subtitle="Create users and control feature access" showFab={false} onRefresh={load}>
      <div className="space-y-3">
        <section className="grid grid-cols-3 gap-2">
          <div className="card-surface rounded-2xl p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Users</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{summary.total}</p>
          </div>
          <div className="card-surface rounded-2xl p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Active</p>
            <p className="mt-1 text-lg font-bold text-emerald-600">{summary.active}</p>
          </div>
          <div className="card-surface rounded-2xl p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Super Admin</p>
            <p className="mt-1 text-lg font-bold text-primary">{summary.superAdmins}</p>
          </div>
        </section>

        <section className="card-surface rounded-2xl p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Team Access</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Super admin can create users for the shared workspace, assign section access, limit usable accounts, and disable accounts when needed.
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
              onClick={openCreate}
            >
              Add User
            </button>
          </div>
        </section>

        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />
          ))
        ) : users.length ? (
          users.map((record) => {
            const accessCount = isSuperAdmin(record)
              ? featureCatalog.length
              : featureCatalog.filter((feature) => record.permissions?.[feature.key]).length;
            const transactionAccess = normalizeTransactionAccess(record.transaction_access);

            return (
              <section key={record.id} className="card-surface rounded-2xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{record.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        isSuperAdmin(record)
                          ? 'bg-primary/10 text-primary'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {isSuperAdmin(record) ? 'Super Admin' : 'User'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        record.is_active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}>
                        {record.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{record.email}</p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Access: {isSuperAdmin(record) ? 'Full system access' : `${accessCount} of ${featureCatalog.length} areas`}
                    </p>
                    {!isSuperAdmin(record) ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Transactions: Edit {transactionScopeLabel(transactionAccess.edit)} | Delete {transactionScopeLabel(transactionAccess.delete)}
                      </p>
                    ) : null}
                    {!isSuperAdmin(record) && record.is_active ? (
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        Deactivate this user first if you want to delete the account later.
                      </p>
                    ) : null}
                  </div>
                  {!isSuperAdmin(record) ? (
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <button
                        type="button"
                        className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        onClick={() => openEdit(record)}
                      >
                        Edit
                      </button>
                      {!record.is_active ? (
                        <button
                          type="button"
                          className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
                          onClick={() => setDeleteTarget(record)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })
        ) : (
          <section className="card-surface rounded-2xl p-4">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">No users yet</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Create the first managed user from the button above.
            </p>
          </section>
        )}
      </div>

      <BottomSheet open={Boolean(deleteTarget)} onClose={closeDelete} title="Delete User">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Delete <strong>{deleteTarget?.name}</strong> from this workspace? The user will be removed from Users & Access,
            login will stop working, and old transaction attribution will stay visible safely.
          </p>
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            This works only after the user has already been marked inactive.
          </p>
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
              disabled={deleting}
              className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              onClick={onDelete}
            >
              {deleting ? 'Deleting...' : 'Delete User'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </AppShell>
  );
}
