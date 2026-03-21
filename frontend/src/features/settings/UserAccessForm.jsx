import {
  normalizeFeaturePermissions,
  normalizeTransactionAccess,
  TRANSACTION_SCOPE_OPTIONS
} from '../../utils/permissions';

function RolePill({ active, children, onClick }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-primary text-white'
          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function UserAccessForm({
  form,
  saving,
  featureCatalog,
  accountScopeRestricted,
  accountSetupLoading,
  managedAccounts,
  onCancel,
  onSave,
  onFieldChange,
  onRoleChange,
  onTogglePermission,
  onEnableAll,
  onDisableAll,
  onTransactionScopeChange,
  onAllowAllAccounts,
  onRestrictAccounts,
  onDefaultAccountChange,
  onToggleAllowedAccount
}) {
  const transactionAccess = normalizeTransactionAccess(form.transaction_access);

  return (
    <div className="space-y-3 pb-4">
      <section className="card-surface rounded-2xl p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {form.id ? 'Edit User Access' : 'Add User'}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Use this full page to manage login details, permissions, and shared-workspace access without layout cutoffs.
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            onClick={onCancel}
          >
            Back
          </button>
        </div>
      </section>

      <section className="card-surface space-y-3 rounded-2xl p-3">
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
          Name
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={form.name}
            onChange={(event) => onFieldChange('name', event.target.value)}
          />
        </label>

        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
          Login Email
          <input
            type="email"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={form.email}
            onChange={(event) => onFieldChange('email', event.target.value)}
          />
        </label>

        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
          {form.id ? 'New Password (optional)' : 'Password'}
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={form.password}
            onChange={(event) => onFieldChange('password', event.target.value)}
            placeholder={form.id ? 'Leave empty to keep current password' : 'At least 8 characters'}
          />
        </label>
      </section>

      <section className="card-surface space-y-3 rounded-2xl p-3">
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/70">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Role</p>
          <div className="mt-2 flex gap-2">
            <RolePill active={form.role === 'user'} onClick={() => onRoleChange('user')}>
              User
            </RolePill>
            <RolePill active={form.role === 'super_admin'} onClick={() => onRoleChange('super_admin')}>
              Super Admin
            </RolePill>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Super admin always gets full access and can manage other users.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3 dark:bg-slate-800/70">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Active account</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inactive users cannot login until re-enabled.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={Boolean(form.is_active)}
              onChange={(event) => onFieldChange('is_active', event.target.checked)}
            />
            <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-primary">
              <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
            </span>
          </label>
        </div>
      </section>

      {form.role === 'user' ? (
        <>
          <section className="card-surface space-y-2 rounded-2xl p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Feature Access</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  onClick={onEnableAll}
                >
                  All On
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  onClick={onDisableAll}
                >
                  All Off
                </button>
              </div>
            </div>

            {featureCatalog.map((feature) => {
              const enabled = Boolean(normalizeFeaturePermissions(form.permissions)[feature.key]);
              return (
                <div key={feature.key} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{feature.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{feature.description}</p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={enabled}
                        onChange={() => onTogglePermission(feature.key)}
                      />
                      <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-primary">
                        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card-surface space-y-3 rounded-2xl p-3">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Transaction Actions</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Decide whether this user can edit or delete only their own transactions or any shared transaction.
              </p>
            </div>

            {[
              {
                key: 'edit',
                title: 'Edit Transactions',
                description: 'Changing amount, category, account, business, notes, and receipt.'
              },
              {
                key: 'delete',
                title: 'Delete Transactions',
                description: 'Remove an existing transaction and recalculate balances.'
              }
            ].map((action) => (
              <div key={action.key} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{action.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{action.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TRANSACTION_SCOPE_OPTIONS.map((option) => (
                    <RolePill
                      key={option.value}
                      active={transactionAccess[action.key] === option.value}
                      onClick={() => onTransactionScopeChange(action.key, option.value)}
                    >
                      {option.label}
                    </RolePill>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="card-surface space-y-2 rounded-2xl p-3">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Account Scope</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Choose whether this user can work on all shared workspace accounts or only selected ones.
              </p>
            </div>

            <div className="mt-2 flex gap-2">
              <RolePill active={!accountScopeRestricted} onClick={onAllowAllAccounts}>
                All Accounts
              </RolePill>
              <RolePill active={accountScopeRestricted} onClick={onRestrictAccounts}>
                Selected Only
              </RolePill>
            </div>

            {accountSetupLoading ? (
              <div className="mt-3 h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ) : managedAccounts.length ? (
              <>
                <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Default Account
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                    value={form.default_account_id}
                    onChange={(event) => onDefaultAccountChange(event.target.value)}
                  >
                    <option value="">No default account</option>
                    {managedAccounts
                      .filter((account) =>
                        !accountScopeRestricted
                        || (form.allowed_account_ids || []).includes(String(account.id))
                      )
                      .map((account) => (
                        <option key={account.id} value={String(account.id)}>
                          {account.name} ({account.type})
                        </option>
                      ))}
                  </select>
                </label>

                {accountScopeRestricted ? (
                  <div className="mt-3 space-y-2">
                    {managedAccounts.map((account) => {
                      const checked = (form.allowed_account_ids || []).includes(String(account.id));
                      const isDefault = String(form.default_account_id || '') === String(account.id);
                      return (
                        <button
                          key={account.id}
                          type="button"
                          className={`w-full rounded-2xl border p-3 text-left transition ${
                            checked
                              ? 'border-primary bg-primary/5'
                              : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                          }`}
                          onClick={() => onToggleAllowedAccount(account.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{account.name}</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {account.type}{isDefault ? ' | Default' : ''}
                              </p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              checked
                                ? 'bg-primary text-white'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {checked ? 'Allowed' : 'Blocked'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                    This user can use any shared workspace account. Default account will be prefilled when possible.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                No shared workspace accounts found yet. Once accounts exist, you can assign account scope here.
              </p>
            )}
          </section>
        </>
      ) : (
        <section className="card-surface rounded-2xl p-3">
          <div className="rounded-2xl bg-primary/5 p-3">
            <p className="text-sm font-bold text-primary">Full access enabled</p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              This account will get all modules, all sections, and user-management rights automatically.
            </p>
          </div>
        </section>
      )}

      <section className="card-surface grid grid-cols-2 gap-2 rounded-2xl p-3">
        <button
          type="button"
          className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
          onClick={onSave}
        >
          {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Create User'}
        </button>
      </section>
    </div>
  );
}
